// backend/src/models/ItemReport.js
const mongoose = require("mongoose");

const itemReportSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Item title is required"],
            trim: true
        },

        description: {
            type: String,
            required: [true, "Item description is required"],
            trim: true
        },

        type: {
            type: String,
            enum: ["lost", "found"],
            required: [true, "Report type is required"]
        },

        category: {
            type: String,
            required: [true, "Category is required"],
            trim: true
        },

        location: {
            type: String,
            required: [true, "Location is required"],
            trim: true
        },

        date: {
            type: Date,
            required: [true, "Date is required"]
        },

        imageUrl: {
    type: String,
    default: ""
},

imageFileId: {
    type: String,
    default: ""
},

        estimatedReplacementValueInr: { type: Number, min: 0 },
        valueTier: { type: String, enum: ["low", "intermediate", "high"] },
        ownershipQuestions: {
            type: [{
                prompt: { type: String, required: true, trim: true, maxlength: 300 },
                verifier: {
                    salt: { type: String, required: true },
                    hash: { type: String, required: true }
                }
            }],
            default: undefined,
            select: false
        },

        custodyStatus: { type: String, enum: ["with_finder", "with_local_admin", "with_owner"], default: undefined },
        custodianUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        custodianAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "LocalAdminAssignment", default: null },

        status: {
            type: String,
            enum: ["active", "resolved", "closed"],
            default: "active"
        },

        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("ItemReport", itemReportSchema);
