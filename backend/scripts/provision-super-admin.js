const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

if (process.env.NODE_ENV === "development") {
  const developmentEnvPath = path.join(__dirname, "..", ".env.development");
  const loaded = dotenv.config({ path: developmentEnvPath, override: true });
  if (loaded.error) {
    throw new Error("Development configuration is missing; backend/.env will not be used in development mode.");
  }

  let existingEnvironment;
  try {
    existingEnvironment = dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env")));
  } catch {
    throw new Error("The existing backend/.env could not be read; refusing to provision against a different Atlas cluster.");
  }

  const { assertDevelopmentEnvironment } = require("../src/config/developmentEnvironment");
  assertDevelopmentEnvironment(process.env, existingEnvironment);
} else {
  dotenv.config();
}

const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const User = require("../src/models/User");
const { connectDB } = require("../src/config/database");

async function main() {
  const { SUPER_ADMIN_NAME: name, SUPER_ADMIN_EMAIL: email, SUPER_ADMIN_PASSWORD: password } = process.env;
  if (!name?.trim() || !email?.trim() || !password || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Set SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of 12–72 bytes for this one-time provisioning run.");
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail !== "superadmin@gmail.com") {
    throw new Error("SUPER_ADMIN_EMAIL must be the configured initial Super Admin email.");
  }
  await connectDB();
  const existingAdmins = await mongoose.connection.collection("users").countDocuments({ role: "admin" });
  if (existingAdmins > 1) throw new Error("Multiple legacy admin records exist. Reconcile them before enforcing the single Super Admin index.");
  await User.init(); // creates the database-enforced one-admin partial unique index
  if (existingAdmins > 0) throw new Error("A Super Admin is already provisioned; this command never creates a second account.");
  if (await User.exists({ email: normalizedEmail })) throw new Error("The supplied email already belongs to an account; provisioning was not performed.");
  const hashedPassword = await bcrypt.hash(password, 12);
  await User.create({ name: name.trim(), email: normalizedEmail, password: hashedPassword, role: "admin", accountStatus: "active" });
  console.log("Super Admin provisioned. Remove the provisioning variables from the process environment.");
}

main().catch((error) => {
  console.error(error.message || "Super Admin provisioning failed.");
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
