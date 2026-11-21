// backend/src/app.js
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const authRoutes = require("./routes/authRoutes");

const app = express();

if (process.env.TRUST_PROXY) {
    const proxySetting = process.env.TRUST_PROXY.trim().toLowerCase();
    if (proxySetting === "true") app.set("trust proxy", 1);
    else if (/^\d+$/.test(proxySetting)) app.set("trust proxy", Number.parseInt(proxySetting, 10));
}

const { protect } = require("./middleware/authMiddleware");
// Import routes
const itemReportRoutes = require("./routes/itemReportRoutes");
const claimRoutes = require("./routes/claimRoutes");
const recoveryRoutes = require("./routes/recoveryRoutes");
const localAdminApplicationRoutes = require("./routes/localAdminApplicationRoutes");
const superAdminRoutes = require("./routes/superAdminRoutes");


const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174")
    .split(",").map((origin) => origin.trim()).filter(Boolean);

// Middleware
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "1mb" }));

// Backend health-check endpoint
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "FindBack AI backend is running!"
    });
});

app.get("/api/ready", async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ success: false, message: "Service is not ready." });
        }
        await mongoose.connection.db.admin().command({ ping: 1 });
        return res.status(200).json({ success: true, ready: true });
    } catch {
        return res.status(503).json({ success: false, message: "Service is not ready." });
    }
});

app.get("/api/auth/me", protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: "Authentication successful!",
    user: req.user,
  });
});

// Item report routes
app.use("/api/reports", itemReportRoutes);
app.use("/api/claims", claimRoutes);
app.use("/api/recovery", recoveryRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", superAdminRoutes);
app.use("/api/admin/local-admin-applications", localAdminApplicationRoutes);

// Keep upload/parser failures in the same safe JSON contract as API errors.
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ success: false, message: "Image exceeds the 5 MB limit." });
    }
    if (error?.name === "MulterError" || error?.message === "Origin is not allowed by CORS.") {
        return res.status(400).json({ success: false, message: "Request could not be accepted." });
    }
    if (error?.type === "entity.too.large") {
        return res.status(413).json({ success: false, message: "Request body is too large." });
    }
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ success: false, message: "Request body must contain valid JSON." });
    }
    console.error("Unhandled API error", { method: req.method, path: req.path });
    return res.status(500).json({ success: false, message: "The request could not be completed." });
});

module.exports = app;
