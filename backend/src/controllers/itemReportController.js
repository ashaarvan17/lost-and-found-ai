// backend/src/controllers/itemReportController.js

const ItemReport = require("../models/ItemReport");

// Create a new lost or found report

exports.createReport = async (req, res) => {
    try {
        const {
            title,
            description,
            type,
            category,
            location,
            date
        } = req.body;

        const userId = req.user.userId;

        // Build the image URL if a photo was uploaded.
        const imageUrl = req.file
            ? `/uploads/${req.file.filename}`
            : "";

        const report = await ItemReport.create({
            title,
            description,
            type,
            category,
            location,
            date,
            imageUrl,
            userId
        });

        return res.status(201).json({
            success: true,
            message: "Item report created successfully",
            data: report
        });

    } catch (error) {
        if (
            error.name === "ValidationError" ||
            error.name === "CastError"
        ) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Create report error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to create item report"
        });
    }
};


// Get all lost and found reports
// Used by Browse Items
exports.getAllReports = async (req, res) => {
    try {
        const reports = await ItemReport.find()
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: reports.length,
            data: reports
        });

    } catch (error) {
        console.error("Get reports error:", error.message);

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

        const reports = await ItemReport.find({ userId })
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: reports.length,
            data: reports
        });

    } catch (error) {
        console.error("Get my reports error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch your reports"
        });
    }
};


// Get one report using its ID
exports.getReportById = async (req, res) => {
    try {
        const report = await ItemReport.findById(req.params.id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Item report not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: report
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