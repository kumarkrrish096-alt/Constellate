import mongoose from "mongoose";

const identitySchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      enum: ["google", "github"],
    },
    providerId: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    linkedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      default: null,
    },
    identities: {
      type: [identitySchema],
      default: [],
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // Password recovery fields (stores SHA-256 hash of token, never plaintext)
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    // Retained for backward compatibility:
    provider: {
      type: String,
      default: null,
    },
    providerId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ──────────────────────────────────────────────────────────
userSchema.index({ email: 1 }, { unique: true });

userSchema.index(
  { "identities.provider": 1, "identities.providerId": 1 },
  { unique: true, sparse: true }
);

// Fast lookup for password reset verification
userSchema.index(
  { passwordResetToken: 1, passwordResetExpires: 1 },
  { sparse: true }
);

// ── Model Helpers ────────────────────────────────────────────────────

userSchema.statics.findByIdentity = function (provider, providerId) {
  return this.findOne({
    $or: [
      { "identities.provider": provider, "identities.providerId": String(providerId) },
      { provider, providerId: String(providerId) },
    ],
  });
};

userSchema.methods.hasProvider = function (provider) {
  if (provider === "password") return !!this.password;
  return (
    this.identities.some((id) => id.provider === provider) ||
    this.provider === provider
  );
};

const User = mongoose.model("User", userSchema, "users");

export default User;
