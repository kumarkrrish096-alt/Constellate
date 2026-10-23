import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user.js";

const SALT_ROUNDS = 10;
const DUMMY_HASH = "$2b$10$wT8m9Lp9V5pD3h0d5k1Yk.1234567890123456789012345678901";

export function generatetoken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      tokenVersion: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function registeruser(name, email, password) {
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    const error = new Error("An account with this email is already registered.");
    error.status = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    emailVerified: false,
    identities: [],
    tokenVersion: 0,
    provider: "local",
  });

  const token = generatetoken(user);

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      providers: ["password"],
    },
  };
}

export async function loginuser(email, password) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    const error = new Error("Invalid email or password.");
    error.status = 401;
    throw error;
  }

  if (!user.password) {
    const linkedProviders = user.identities?.length
      ? user.identities.map((id) => id.provider).join(" or ")
      : user.provider || "OAuth";

    const error = new Error(
      `This account uses ${linkedProviders} sign-in. Please log in with ${linkedProviders}.`
    );
    error.status = 401;
    throw error;
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    const error = new Error("Invalid email or password.");
    error.status = 401;
    throw error;
  }

  const token = generatetoken(user);

  const providers = [];
  if (user.password) providers.push("password");
  if (user.identities) {
    user.identities.forEach((id) => providers.push(id.provider));
  } else if (user.provider && user.provider !== "local") {
    providers.push(user.provider);
  }

  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      providers,
    },
  };
}

export async function getUserIdentities(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }

  const providers = [];
  if (user.password) providers.push("password");
  if (user.identities?.length) {
    user.identities.forEach((id) => {
      if (!providers.includes(id.provider)) providers.push(id.provider);
    });
  } else if (user.provider && user.provider !== "local") {
    providers.push(user.provider);
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    hasPassword: Boolean(user.password),
    providers,
    identities: user.identities || [],
  };
}

export async function linkPassword(userId, newPassword, currentPassword = null) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }

  if (user.password) {
    if (!currentPassword) {
      const error = new Error("Current password is required to change password.");
      error.status = 400;
      throw error;
    }
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      const error = new Error("Incorrect current password.");
      error.status = 401;
      throw error;
    }
  }

  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();

  return { message: "Password authentication linked successfully." };
}

export async function linkOAuthIdentity(userId, { provider, providerId, email }) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }

  const existingOwner = await User.findByIdentity(provider, providerId);
  if (existingOwner && String(existingOwner._id) !== String(userId)) {
    const error = new Error(
      `This ${provider} account is already linked to another Constellate user.`
    );
    error.status = 409;
    throw error;
  }

  const alreadyLinked = user.identities.some(
    (id) => id.provider === provider && id.providerId === String(providerId)
  );

  if (!alreadyLinked) {
    user.identities.push({
      provider,
      providerId: String(providerId),
      email: email ? email.toLowerCase().trim() : null,
      linkedAt: new Date(),
    });
    await user.save();
  }

  return { message: `${provider} linked successfully.` };
}

export async function unlinkIdentity(userId, providerToUnlink) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }

  const hasPassword = Boolean(user.password);
  const oauthCount = user.identities?.length || (user.provider && user.provider !== "local" ? 1 : 0);
  const totalMethods = (hasPassword ? 1 : 0) + oauthCount;

  if (totalMethods <= 1) {
    const error = new Error(
      "Cannot remove your only authentication method. Please add another login method before removing this one."
    );
    error.status = 400;
    throw error;
  }

  if (providerToUnlink === "password") {
    user.password = null;
  } else {
    user.identities = user.identities.filter((id) => id.provider !== providerToUnlink);
    if (user.provider === providerToUnlink) {
      user.provider = user.identities[0]?.provider || (hasPassword ? "local" : null);
      user.providerId = user.identities[0]?.providerId || null;
    }
  }

  await user.save();
  return { message: `${providerToUnlink} unlinked successfully.` };
}

// ── Password Recovery & Session Revocation ───────────────────

/**
 * Request a password reset token for an email address.
 * Generates an unguessable 32-byte token and stores sha256(token) in MongoDB.
 */
export async function requestPasswordReset(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  // Anti-enumeration: return success message even if account not found
  if (!user) {
    return {
      message: "If an account exists with this email, instructions have been sent.",
      resetToken: null,
    };
  }

  // Generate 32-byte secure random token
  const rawToken = crypto.randomBytes(32).toString("hex");

  // Hash token with SHA-256 before saving to database
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 3600000); // Valid for 1 hour
  await user.save();

  return {
    message: "If an account exists with this email, instructions have been sent.",
    resetToken: rawToken, // Returned so email service (or dev console) can deliver it
  };
}

/**
 * Reset password using a valid, non-expired reset token.
 * Upon reset, tokenVersion is incremented, immediately revoking all active sessions.
 */
export async function resetPasswordWithToken(rawToken, newPassword) {
  // Hash the incoming token with SHA-256 to compare with stored hash
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    const error = new Error("Password reset token is invalid or has expired.");
    error.status = 400;
    throw error;
  }

  // Update password
  user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Clear reset token fields
  user.passwordResetToken = null;
  user.passwordResetExpires = null;

  // Revoke all active sessions on other devices
  user.tokenVersion = (user.tokenVersion || 0) + 1;

  await user.save();

  return { message: "Password has been reset successfully. Please log in with your new password." };
}

/**
 * Revoke all active sessions for a user (used by logout endpoint)
 */
export async function revokeAllSessions(userId) {
  const user = await User.findById(userId);
  if (user) {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
  }
  return { message: "Logged out successfully." };
}
