import mongoose from "mongoose";

// One document per signed-in device/browser. Only SHA-256 hashes of refresh
// tokens are stored, so a database leak does not leak usable sessions.
const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    // Previous token after a rotation, kept briefly for reuse detection.
    prevTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    rotatedAt: {
      type: Date,
      default: null,
    },
    // false = "Remember me" unchecked: cookie is dropped when the browser closes.
    persistent: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// MongoDB deletes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Session = mongoose.model("Session", sessionSchema, "sessions");

export default Session;
