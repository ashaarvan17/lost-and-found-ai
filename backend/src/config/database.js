
const mongoose = require("mongoose");

function collectConnectionErrors(rootError) {
    const found = [];
    const pending = [rootError];
    const seen = new Set();

    while (pending.length && found.length < 20) {
        const error = pending.shift();
        if (!error || typeof error !== "object" || seen.has(error)) continue;
        seen.add(error);
        found.push(error);

        for (const nested of [error.cause, error.reason, error.error]) {
            if (nested && typeof nested === "object") pending.push(nested);
        }
        if (Array.isArray(error.errors)) pending.push(...error.errors);

        const servers = error.servers || error.reason?.servers;
        if (servers instanceof Map) {
            for (const server of servers.values()) {
                if (server?.error) pending.push(server.error);
            }
        }
    }

    return found;
}

function redactConnectionMessage(message, connectionUri = process.env.MONGODB_URI) {
    let safeMessage = String(message || "");

    try {
        const uri = new URL(connectionUri);
        for (const value of [uri.href, uri.hostname, uri.username, uri.password]) {
            if (value) safeMessage = safeMessage.split(value).join("[redacted]");
        }
        for (const value of [uri.username, uri.password]) {
            if (!value) continue;
            try {
                const decoded = decodeURIComponent(value);
                if (decoded) safeMessage = safeMessage.split(decoded).join("[redacted]");
            } catch {
                // Keep the encoded value redaction above if it is not valid URI encoding.
            }
        }
    } catch {
        // The original connection error will explain an invalid URI without printing its value.
    }

    safeMessage = safeMessage
        .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[redacted MongoDB URI]")
        .replace(/(?:_mongodb\._tcp\.)?[a-z0-9.-]+\.mongodb\.net/gi, "[redacted Atlas host]")
        .replace(/\b[^\s/@:]+:[^\s/@]+@/g, "[redacted credentials]@");

    return safeMessage.slice(0, 600);
}

function getSafeConnectionDiagnostic(error, connectionUri = process.env.MONGODB_URI) {
    const errors = collectConnectionErrors(error);
    return {
        errorTypes: [...new Set(errors.map((entry) => entry.name).filter(Boolean))],
        errorCodes: [...new Set(errors.flatMap((entry) => [entry.code, entry.codeName]).filter(Boolean))],
        messages: [...new Set(errors.map((entry) => redactConnectionMessage(entry.message, connectionUri)).filter(Boolean))],
    };
}

// Function to connect to MongoDB
async function connectDB() {
    try {
        if (!process.env.MONGODB_URI) throw new Error("MongoDB connection URI is missing.");
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 15000
        });

        console.log("MongoDB connected successfully.");

    } catch (error) {
        console.error("MongoDB connection failed.");
        if (process.env.NODE_ENV === "development") {
            console.error("MongoDB development connection diagnostic:", getSafeConnectionDiagnostic(error));
            throw error;
        }
        throw new Error("MongoDB connection failed.", { cause: error });
    }
}

module.exports = connectDB;
module.exports.getSafeConnectionDiagnostic = getSafeConnectionDiagnostic;
module.exports.redactConnectionMessage = redactConnectionMessage;
