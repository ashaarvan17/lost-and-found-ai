//backend/src/models/User.js


const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    accountStatus: {
      type: String,
      enum: ["active", "local_admin_pending", "local_admin_approved", "local_admin_rejected"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// The existing `admin` role is the single Main/Super Admin role. Public
// registration never accepts it; this partial unique index is the database
// backstop for provisioning and any privileged writes.
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "admin" }, name: "one_super_admin" });

module.exports = mongoose.model("User", userSchema);
