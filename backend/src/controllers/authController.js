const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const LocalAdminApplication = require("../models/LocalAdminApplication");

// Register a new user
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (name.trim().length > 100 || normalizedEmail.length > 254 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ success: false, message: "Name, email, or password exceeds its allowed length." });
    }
    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
      });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered.",
      });
    }

    console.error("Registration failed.");

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
    });
  }
};

async function authenticateUser(req, res, { superAdminOnly = false } = {}) {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length > 254 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (superAdminOnly && (user.role !== "admin" || ![undefined, "active"].includes(user.accountStatus))) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (user.accountStatus === "local_admin_pending") {
      return res.status(403).json({ success: false, code: "LOCAL_ADMIN_PENDING", message: "Your Local Admin application is pending Super Admin review. You cannot access an account until it is approved." });
    }
    if (user.accountStatus === "local_admin_rejected") {
      return res.status(403).json({ success: false, code: "LOCAL_ADMIN_REJECTED", message: "This Local Admin application was not approved. Contact support if you need help." });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from the environment.");

      return res.status(500).json({
        success: false,
        message: "Login is temporarily unavailable.",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus || "active",
      },
    });
  } catch (error) {
    console.error("Login failed.");

    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
}

// Public login remains role-neutral; the dedicated endpoint authenticates
// the same stored credentials but only issues a token for the single admin.
exports.login = (req, res) => authenticateUser(req, res);
exports.loginSuperAdmin = (req, res) => authenticateUser(req, res, { superAdminOnly: true });

exports.applyAsLocalAdmin = async (req, res) => {
  const { name, email, password, requestedArea, phone = "", verificationDetails = "" } = req.body || {};
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 ||
      typeof email !== "string" || typeof password !== "string" ||
      typeof requestedArea !== "string" || !requestedArea.trim() || requestedArea.trim().length > 200 ||
      typeof phone !== "string" || phone.trim().length > 40 ||
      typeof verificationDetails !== "string" || verificationDetails.trim().length > 500 ||
      Buffer.byteLength(password, "utf8") > 72 || password.length < 8) {
    return res.status(400).json({ success: false, message: "Enter a valid name, email, password, and requested area. Optional contact details must fit the stated limits." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }
  const session = await mongoose.startSession();
  try {
    const existing = await User.findOne({ email: normalizedEmail }).select("_id");
    if (existing) return res.status(409).json({ success: false, message: "This email is already registered." });
    const hashedPassword = await bcrypt.hash(password, 12);
    let application;
    await session.withTransaction(async () => {
      const [user] = await User.create([{ name: name.trim(), email: normalizedEmail, password: hashedPassword, accountStatus: "local_admin_pending" }], { session });
      [application] = await LocalAdminApplication.create([{
        userId: user._id,
        requestedArea: requestedArea.trim(),
        phone: phone.trim(),
        verificationDetails: verificationDetails.trim(),
      }], { session });
    });
    return res.status(201).json({ success: true, message: "Application submitted. Local Admin access requires Super Admin approval and a separate area assignment.", data: { applicationId: String(application._id), status: application.status, requestedArea: application.requestedArea } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This email is already registered or already has an application." });
    console.error("Local Admin application submission failed.");
    return res.status(503).json({ success: false, message: "Applications are temporarily unavailable. Please try again later." });
  } finally {
    await session.endSession();
  }
};
