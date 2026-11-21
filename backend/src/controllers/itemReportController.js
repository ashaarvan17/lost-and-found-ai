//itemReportController.js
const imagekit = require("../config/imagekit");
const ItemReport = require("../models/ItemReport");
const axios = require("axios");
const { assignValueTier, parseEstimatedValue, getQuestionCount } = require("../config/itemValueTier");
const { createAnswerVerifier } = require("../services/ownershipVerification");
const MatchCandidate = require("../models/MatchCandidate");
const Claim = require("../models/Claim");
const RecoveryTransaction = require("../models/RecoveryTransaction");
const AuditEvent = require("../models/AuditEvent");

// Python AI service URL
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000/match-text";
const IMAGE_VALIDATION_URL = process.env.IMAGE_VALIDATION_URL || "http://127.0.0.1:8000/validate-image";

class ImageValidationError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

async function validateImageUpload(file) {
    if (!process.env.AI_SERVICE_TOKEN) {
        throw new ImageValidationError(503, "Secure image validation is not configured.");
    }
    const form = new FormData();
    form.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname || "upload");
    let response;
    try {
        response = await fetch(IMAGE_VALIDATION_URL, {
            method: "POST",
            headers: { "X-AI-Service-Token": process.env.AI_SERVICE_TOKEN },
            body: form,
            signal: AbortSignal.timeout(Number.parseInt(process.env.IMAGE_VALIDATION_TIMEOUT_MS || "7000", 10)),
        });
    } catch {
        throw new ImageValidationError(503, "Image validation is temporarily unavailable.");
    }
    if (response.status === 422) throw new ImageValidationError(400, "Image content is malformed or exceeds allowed dimensions.");
    if (!response.ok) throw new ImageValidationError(503, "Image validation is temporarily unavailable.");
    const result = await response.json().catch(() => null);
    if (!result?.success || !Number.isInteger(result.image?.width) || !Number.isInteger(result.image?.height) || !Number.isInteger(result.image?.pixelCount)) {
        throw new ImageValidationError(503, "Image validation is temporarily unavailable.");
    }
    return result;
}

function privateImageUrl(url) {
    const endpoint = new URL(process.env.IMAGEKIT_URL_ENDPOINT);
    const storedUrl = new URL(url);
    if (storedUrl.origin !== endpoint.origin || !storedUrl.pathname.startsWith(`${endpoint.pathname.replace(/\/$/, "")}/`)) {
        throw new Error("Stored private image is outside the configured ImageKit endpoint.");
    }
    const configuredTtl = Number.parseInt(process.env.PRIVATE_IMAGE_URL_TTL_SECONDS || "300", 10);
    const expireSeconds = Number.isInteger(configuredTtl) ? Math.max(60, Math.min(900, configuredTtl)) : 300;
    return imagekit.url({ src: url, signed: true, expireSeconds });
}

function reportDto(report, { includePrivateImage = false, status = report.status } = {}) {
    const dto = {
        _id: report._id,
        title: report.title,
        description: report.description,
        type: report.type,
        category: report.category,
        location: report.location,
        date: report.date,
        status,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt
    };
    if (report.type === "found" && report.valueTier) {
        dto.estimatedReplacementValueInr = report.estimatedReplacementValueInr;
        dto.valueTier = report.valueTier;
        dto.ownershipQuestions = (report.ownershipQuestions || []).map(({ prompt }) => ({ prompt }));
    }
    // Lost-report images are part of the public lost-report view. Found images
    // are signed and included only in finder-authorized report responses.
    if (report.type === "lost" && report.imageUrl) {
        dto.imageUrl = report.imageUrl;
    }
    if (report.type === "found" && includePrivateImage && report.imageUrl) {
        dto.imageUrl = privateImageUrl(report.imageUrl);
    }
    return dto;
}

// Earlier recovery completions could leave the claimant's linked lost report
// active. Derive its effective state from the verified claim plus completed
// final recovery and resolved found report, without exposing found data or
// mutating historical records during reads.
async function getRecoveredLostReportIds(reports) {
    const activeLostReports = reports.filter((report) => report.type === "lost" && report.status === "active");
    if (!activeLostReports.length) return new Set();

    const claims = await Claim.find({
        status: "verified",
        lostReportId: { $in: activeLostReports.map((report) => report._id) },
    }).select("_id lostReportId foundReportId").lean();
    if (!claims.length) return new Set();

    const claimIds = claims.map((claim) => claim._id);
    const foundIds = [...new Set(claims.map((claim) => String(claim.foundReportId)))];
    const [resolvedFoundReports, completedRecoveries] = await Promise.all([
        ItemReport.find({
            _id: { $in: foundIds },
            type: "found",
            status: "resolved",
            custodyStatus: "with_owner",
        }).select("_id").lean(),
        RecoveryTransaction.find({
            claimId: { $in: claimIds },
            purpose: { $in: ["personal_handover", "local_admin_collection"] },
            status: "completed",
            completedBy: { $ne: null },
        }).select("claimId").lean(),
    ]);
    const resolvedFoundIds = new Set(resolvedFoundReports.map((report) => String(report._id)));
    const completedClaimIds = new Set(completedRecoveries.map((recovery) => String(recovery.claimId)));

    return new Set(claims
        .filter((claim) => resolvedFoundIds.has(String(claim.foundReportId)) && completedClaimIds.has(String(claim._id)))
        .map((claim) => String(claim.lostReportId)));
}

function publicLostReportDto(report, options) {
    return reportDto(report, options);
}

// Create a new lost or found report

// Create a new lost or found report
exports.createReport = async (req, res) => {
    let uploadedImageFileId = "";
    try {
        const {
            title,
            description,
            type,
            category,
            location,
            date,
            estimatedReplacementValueInr,
            ownershipQuestions
        } = req.body;

        const userId = req.user.userId;

        let valueTier;
        let privateQuestions;
        if (type === "found") {
            const amount = parseEstimatedValue(estimatedReplacementValueInr);
            valueTier = assignValueTier(amount);
            const questionCount = valueTier && getQuestionCount(valueTier);
            let parsedQuestions = ownershipQuestions;
            if (typeof parsedQuestions === "string") {
                try { parsedQuestions = JSON.parse(parsedQuestions); } catch { parsedQuestions = null; }
            }
            if (amount === null || !valueTier || !Array.isArray(parsedQuestions) || parsedQuestions.length !== questionCount) {
                return res.status(400).json({ success: false, message: "A valid estimated replacement value and the required number of ownership questions and answers are required." });
            }
            try {
                privateQuestions = await Promise.all(parsedQuestions.map(async (entry) => {
                    const prompt = typeof entry?.prompt === "string" ? entry.prompt.trim() : "";
                    const answer = typeof entry?.expectedAnswer === "string" ? entry.expectedAnswer.trim() : "";
                    if (!prompt || prompt.length > 300 || !answer || answer.length > 1000) throw new TypeError("Invalid question or expected answer");
                    return { prompt, verifier: await createAnswerVerifier(answer) };
                }));
            } catch {
                return res.status(400).json({ success: false, message: "Each ownership question and expected answer must be valid." });
            }
        }

        let imageUrl = "";
        let imageFileId = "";

        // Upload image to ImageKit
        if (req.file) {
            const signatures = {
                "image/jpeg": req.file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
                "image/png": req.file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
                "image/webp": req.file.buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
                    req.file.buffer.subarray(8, 12).toString("ascii") === "WEBP"
            };
            if (!signatures[req.file.mimetype]) {
                return res.status(400).json({
                    success: false,
                    message: "Image content does not match an allowed image type"
                });
            }

            await validateImageUpload(req.file);

            const uploadedImage = await imagekit.upload({
                file: req.file.buffer,
                fileName: `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120)}`,
                folder: process.env.IMAGEKIT_UPLOAD_FOLDER || "/findback-ai/items",
                isPrivateFile: type === "found"
            });

            imageUrl = uploadedImage.url;
            imageFileId = uploadedImage.fileId;
            uploadedImageFileId = imageFileId;
        }

        // Save report details in MongoDB
        const report = await ItemReport.create({
            title,
            description,
            type,
            category,
            location,
            date,
            imageUrl,
            imageFileId,
            ...(type === "found" ? { estimatedReplacementValueInr: parseEstimatedValue(estimatedReplacementValueInr), valueTier, ownershipQuestions: privateQuestions } : {}),
            ...(type === "found" ? { custodyStatus: "with_finder", custodianUserId: userId } : {}),
            userId
        });

        return res.status(201).json({
            success: true,
            message: "Item report created successfully",
            data: reportDto(report)
        });

    } catch (error) {
        if (uploadedImageFileId) {
            try {
                await imagekit.deleteFile(uploadedImageFileId);
            } catch {
                // Preserve the original request failure; orphan cleanup can be retried operationally.
            }
        }
        if (error instanceof ImageValidationError) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        console.error("Create report failed");

        return res.status(500).json({
            success: false,
            message: "Failed to create item report"
        });
    }
};


// Public browse exposes active and resolved lost reports; found report data stays private.
exports.getAllReports = async (req, res) => {
    try {
        const reports = await ItemReport.find({ type: "lost", status: { $in: ["active", "resolved"] } })
            .sort({ createdAt: -1 });
        const recoveredLostIds = await getRecoveredLostReportIds(reports);

        return res.status(200).json({
            success: true,
            count: reports.length,
            data: reports.map((report) => publicLostReportDto(report, {
                status: recoveredLostIds.has(String(report._id)) ? "resolved" : report.status,
            }))
        });

    } catch (error) {
        console.error("Get reports failed");

        return res.status(500).json({
            success: false,
            message: "Failed to fetch item reports"
        });
    }
};


// Get reports belonging only to the logged-in user
exports.getMyReports = async (req, res) => {
    try {
        const userId = req.user.userId;

        const reports = await ItemReport.find({ userId }).select("+ownershipQuestions")
            .sort({ createdAt: -1 });
        const recoveredLostIds = await getRecoveredLostReportIds(reports);

        res.set("Cache-Control", "private, no-store");
        return res.status(200).json({
            success: true,
            count: reports.length,
            data: reports.map((report) => reportDto(report, {
                includePrivateImage: true,
                status: recoveredLostIds.has(String(report._id)) ? "resolved" : report.status,
            }))
        });

    } catch (error) {
        console.error("Get my reports failed");

        return res.status(500).json({
            success: false,
            message: "Failed to fetch your reports"
        });
    }
};


// Get one report using its ID
exports.getReportById = async (req, res) => {
    try {
        const report = await ItemReport.findById(req.params.id).select("+ownershipQuestions");

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Item report not found"
            });
        }

        if (
            report.type === "found" &&
            (!req.user || String(report.userId) !== String(req.user.userId))
        ) {
            // Do not reveal whether another user's private report exists.
            return res.status(404).json({
                success: false,
                message: "Item report not found"
            });
        }

        if (report.type === "found") res.set("Cache-Control", "private, no-store");
        return res.status(200).json({
            success: true,
            data: reportDto(report, { includePrivateImage: report.type === "found" })
        });

    } catch (error) {
        const invalidId =
            error.name === "CastError" ||
            error.name === "BSONError";

        return res.status(invalidId ? 400 : 500).json({
            success: false,
            message: invalidId
                ? "Invalid report ID"
                : "Failed to fetch item report"
        });
    }
};

// Found photos are delivered only to the finder through short-lived signed URLs.
exports.getPrivateReportImage = async (req, res) => {
    try {
        const report = await ItemReport.findOne({ _id: req.params.id, type: "found", userId: req.user.userId }).select("imageUrl");
        if (!report || !report.imageUrl) return res.status(404).json({ success: false, message: "Image not found" });
        const signedUrl = privateImageUrl(report.imageUrl);
        res.set("Cache-Control", "private, no-store");
        return res.status(200).json({ success: true, data: { imageUrl: signedUrl } });
    } catch {
        return res.status(503).json({ success: false, message: "Private image delivery is unavailable." });
    }
};


// Compare two text values using word similarity.
// Used as a fallback if Python AI is unavailable.
function calculateTextSimilarity(text1 = "", text2 = "") {
    const stopWords = new Set([
        "the", "a", "an", "is", "it", "and", "or",
        "of", "in", "on", "at", "with", "my", "this",
        "that", "was", "has", "have"
    ]);

    const getWords = (text) =>
        new Set(
            String(text)
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, " ")
                .split(/\s+/)
                .filter(word =>
                    word.length > 1 && !stopWords.has(word)
                )
        );

    const words1 = getWords(text1);
    const words2 = getWords(text2);

    if (words1.size === 0 || words2.size === 0) {
        return 0;
    }

    const commonWords = [...words1].filter(word =>
        words2.has(word)
    );

    const totalWords = new Set([...words1, ...words2]).size;

    return commonWords.length / totalWords;
}


// Calculate semantic similarity using Python AI.
// If the AI service is unavailable, use the old text algorithm.
async function calculateAITextSimilarity(report1, report2) {
    try {
        const response = await axios.post(
            AI_SERVICE_URL,
            {
                lost_title: String(report1.title || ""),
                lost_description: String(report1.description || ""),
                found_title: String(report2.title || ""),
                found_description: String(report2.description || "")
            },
            {
                timeout: 10000,
                headers: process.env.AI_SERVICE_TOKEN
                    ? { "X-AI-Service-Token": process.env.AI_SERVICE_TOKEN }
                    : undefined
            }
        );

        if (
            response.data &&
            response.data.success &&
            Number.isFinite(response.data.textSimilarity)
        ) {
            return {
                similarity: Math.max(
                    0,
                    Math.min(100, response.data.textSimilarity)
                ) / 100,
                aiUsed: true
            };
        }

        throw new Error("Invalid AI response");

    } catch (error) {
        console.error("Python AI service unavailable. Using safe text fallback.");

        const titleSimilarity = calculateTextSimilarity(
            report1.title,
            report2.title
        );

        const descriptionSimilarity = calculateTextSimilarity(
            report1.description,
            report2.description
        );

        // Combine title and description fallback similarity
        const fallbackSimilarity =
            (titleSimilarity * 0.4) +
            (descriptionSimilarity * 0.6);

        return {
            similarity: fallbackSimilarity,
            aiUsed: false
        };
    }
}


// Calculate location similarity
function calculateLocationSimilarity(location1 = "", location2 = "") {
    return calculateTextSimilarity(location1, location2);
}


// Calculate date proximity
function calculateDateScore(date1, date2) {
    const firstDate = new Date(date1);
    const secondDate = new Date(date2);

    if (
        Number.isNaN(firstDate.getTime()) ||
        Number.isNaN(secondDate.getTime())
    ) {
        return {
            score: 0,
            reason: null
        };
    }

    const daysDifference = Math.abs(
        firstDate.getTime() - secondDate.getTime()
    ) / (1000 * 60 * 60 * 24);

    if (daysDifference <= 1) {
        return {
            score: 5,
            reason: "Reported around the same date"
        };
    }

    if (daysDifference <= 3) {
        return {
            score: 4,
            reason: "Reported within a few days"
        };
    }

    if (daysDifference <= 7) {
        return {
            score: 3,
            reason: "Reported within a week"
        };
    }

    if (daysDifference <= 14) {
        return {
            score: 2,
            reason: null
        };
    }

    if (daysDifference <= 30) {
        return {
            score: 1,
            reason: null
        };
    }

    return {
        score: 0,
        reason: null
    };
}


// Calculate matching score between two reports
async function calculateMatchScore(report1, report2) {
    let score = 0;
    const reasons = [];

    // 1. Category matching: 20 points
    const category1 = String(report1.category || "")
        .trim()
        .toLowerCase();

    const category2 = String(report2.category || "")
        .trim()
        .toLowerCase();

    if (category1 && category1 === category2) {
        score += 20;
        reasons.push("Same category");
    }

    // 2. AI text similarity: 50 points
    const textResult = await calculateAITextSimilarity(
        report1,
        report2
    );

    const textSimilarity = textResult.similarity;

    const textPoints = Math.round(textSimilarity * 50);

    score += textPoints;

    if (textSimilarity >= 0.5) {
        reasons.push(
            textResult.aiUsed
                ? "AI detected similar item descriptions"
                : "Similar item titles and descriptions"
        );
    }

    // 3. Location similarity: 15 points
    const locationSimilarity = calculateLocationSimilarity(
        report1.location,
        report2.location
    );

    const locationPoints = Math.round(
        locationSimilarity * 15
    );

    score += locationPoints;

    if (locationSimilarity > 0) {
        reasons.push("Similar locations");
    }

    // 4. Date proximity: 5 points
    const dateResult = calculateDateScore(
        report1.date,
        report2.date
    );

    score += dateResult.score;

    if (dateResult.reason) {
        reasons.push(dateResult.reason);
    }

    // Image similarity: 10 points
    // Not implemented yet. Reserved for future image AI.

    return {
        score: Math.min(score, 90),
        reasons,
        titleSimilarity: textSimilarity,
        descriptionSimilarity: textSimilarity,
        locationSimilarity,
        aiUsed: textResult.aiUsed
    };
}


// Get potential matches for the logged-in user's reports
exports.getMyMatches = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Step 1: Get current user's active reports
        const myReports = await ItemReport.find({
            userId,
            type: "lost",
            status: "active"
        });

        const recoveredLostIds = await getRecoveredLostReportIds(myReports);
        const eligibleLostReports = myReports.filter((report) => !recoveredLostIds.has(String(report._id)));

        // Return empty matches if no reports exist
        if (eligibleLostReports.length === 0) {
            return res.status(200).json({
                success: true,
                count: 0,
                data: []
            });
        }

        // Step 2: Get active reports from other users
        const otherReports = await ItemReport.find({
            type: "found",
            userId: { $ne: userId },
            status: "active"
        });

        const matches = [];

        // Step 3: Compare reports
        for (const myReport of eligibleLostReports) {
            for (const otherReport of otherReports) {

                // Step 4: Calculate AI matching score
                const {
                    score,
                    reasons,
                    titleSimilarity,
                    descriptionSimilarity,
                    locationSimilarity,
                    aiUsed
                } = await calculateMatchScore(
                    myReport,
                    otherReport
                );

                // Step 5: Check for meaningful similarity
                const hasMeaningfulSimilarity =
                    titleSimilarity > 0 ||
                    descriptionSimilarity > 0 ||
                    locationSimilarity > 0;

                // Step 6: Include relevant matches
                if (score >= 40 && hasMeaningfulSimilarity) {

                    // Keep candidate details server-side. The lost reporter only
                    // receives an indication that at least one private found
                    // report may match.
                    const candidate = await MatchCandidate.findOneAndUpdate(
                        { lostReportId: myReport._id, foundReportId: otherReport._id },
                        { $setOnInsert: { lostReportId: myReport._id, foundReportId: otherReport._id } },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    ).select("+lostReportId +foundReportId");
                    matches.push({ candidateId: String(candidate._id), lostReportId: String(myReport._id) });
                }
            }
        }

        // Step 7: Sort by highest similarity score
        const reportById = new Map(eligibleLostReports.map((report) => [String(report._id), report]));
        const restrictedMatches = [...new Map(matches.map((match) => [match.candidateId, match])).values()]
            .map((match) => {
                const report = reportById.get(match.lostReportId);
                return { id: match.candidateId, lostReport: { id: String(report._id), title: report.title, category: report.category, date: report.date }, status: "possible" };
            });

        // Step 8: Send response
        return res.status(200).json({
            success: true,
            count: restrictedMatches.length,
            data: restrictedMatches
        });

    } catch {
        console.error("Failed to generate potential matches");

        return res.status(500).json({
            success: false,
            message: "Failed to generate potential matches"
        });
    }
};

// Finder may replace questions only when no claim is currently in progress.
exports.updateOwnershipQuestions = async (req, res) => {
    try {
        const report = await ItemReport.findOne({ _id: req.params.id, userId: req.user.userId, type: "found" }).select("+ownershipQuestions");
        if (!report) return res.status(404).json({ success: false, message: "Item report not found" });
        const activeClaim = await Claim.exists({ foundReportId: report._id, status: { $in: ["questions_issued", "verification_failed"] } });
        if (activeClaim) return res.status(409).json({ success: false, message: "Ownership questions cannot be edited while a claim is in progress." });
        if (!Array.isArray(req.body.ownershipQuestions) || req.body.ownershipQuestions.length !== getQuestionCount(report.valueTier)) {
            return res.status(400).json({ success: false, message: "The question count must match the report's assigned value tier." });
        }
        const updated = await Promise.all(req.body.ownershipQuestions.map(async (entry) => {
            const prompt = typeof entry?.prompt === "string" ? entry.prompt.trim() : "";
            const expectedAnswer = typeof entry?.expectedAnswer === "string" ? entry.expectedAnswer.trim() : "";
            if (!prompt || prompt.length > 300 || !expectedAnswer || expectedAnswer.length > 1000) throw new TypeError("Invalid question or answer");
            return { prompt, verifier: await createAnswerVerifier(expectedAnswer) };
        }));
        report.ownershipQuestions = updated;
        await report.save();
        return res.status(200).json({ success: true, data: reportDto(report) });
    } catch (error) {
        const badInput = error instanceof TypeError;
        return res.status(badInput ? 400 : 500).json({ success: false, message: badInput ? "Each ownership question and expected answer must be valid." : "Failed to update ownership questions" });
    }
};

// Existing `admin` role represents the Main Admin in this application.
exports.elevateValueTier = async (req, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Main Admin access required" });
    const rank = { low: 0, intermediate: 1, high: 2 };
    try {
        const report = await ItemReport.findOne({ _id: req.params.id, type: "found" });
        if (!report) return res.status(404).json({ success: false, message: "Item report not found" });
        const target = req.body.valueTier;
        if (!Object.hasOwn(rank, report.valueTier)) return res.status(409).json({ success: false, message: "The current value tier needs correction or review before it can be elevated." });
        if (!Object.hasOwn(rank, target) || rank[target] <= rank[report.valueTier]) return res.status(400).json({ success: false, message: "The tier may only be elevated." });
        const previousTier = report.valueTier;
        report.valueTier = target;
        await report.save();
        try {
            await AuditEvent.create({ actorId: req.user.userId, action: "item_value_tier_elevated", resourceType: "ItemReport", resourceId: report._id, details: { previousTier, newTier: target } });
        } catch (auditError) {
            // If the audit record cannot be committed, revert the tier mutation.
            report.valueTier = previousTier;
            await report.save();
            throw auditError;
        }
        return res.status(200).json({ success: true, data: reportDto(report) });
    } catch {
        return res.status(500).json({ success: false, message: "Failed to elevate value tier" });
    }
};
