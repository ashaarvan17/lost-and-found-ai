// backend/src/app.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");

const app = express();

const path = require("path");

const { protect } = require("./middleware/authMiddleware");
// Import routes
const itemReportRoutes = require("./routes/itemReportRoutes");


// Middleware
app.use(cors({
    origin: [
        "http://localhost:5173",
        "http://localhost:5174"
    ]
}));

app.use(express.json());

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
);

// Backend health-check endpoint
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "FindBack AI backend is running!"
    });
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
app.use("/api/auth", authRoutes);

module.exports = app;
