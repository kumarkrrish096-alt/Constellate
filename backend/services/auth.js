import crypto from "crypto";
import bcrypt from "bcrypt";
import User from "../models/user.js";
import { BCRYPT_ROUNDS } from "../config/auth.js";
import { publicUser, revokeAllUserSessions } from "./session.js";

// Compared against when the email is unknown, so "no such user" takes as long
// as "wrong password" and response timing does not reveal registered emails.
const dummyHash = bcrypt.hash("constellate-timing-equaliser", BCRYPT_ROUNDS);

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function authError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

const normalizeEmail = (email) => email.toLowerCase().trim();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export async function registeruser(name, email, password) {
  const normalizedEmail = normalizeEmail(email);

  const existing = await User.exists({ email: normalizedEmail });
  if (existing) {
    throw authError(409, "An account with this email is already registered.");
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    return await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      emailVerified: false,
      identities: [],
      provider: "local",
    });
  } catch (error) {
    // Two signups for the same email racing past the check above.
    if (error.code === 11000) {
      throw authError(409, "An account with this email is already registered.");
    }
    throw error;
  }
}

export async function loginuser(email, password) {
  const user = await User.findOne({ email: normalizeEmail(email) });

  if (!user || !user.password) {
    await bcrypt.compare(password, await dummyHash);
  }

  if (!user) {
    throw authError(401, "Invalid email or password.");
  }

  if (!user.password) {
    const linked = (user.identities || []).map((id) => id.provider);
    const names = linked.length ? linked.map(providerLabel).join(" or ") : "Google or GitHub";
    throw authError(401, `This account signs in with ${names}. Use that button below.`);
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw authError(401, "Invalid email or password.");
  }

  return user;
}

export function providerLabel(provider) {
  return { google: "Google", github: "GitHub", password: "email and password" }[provider] || provider;
}

export async function getUserIdentities(userId) {
  const user = await User.findById(userId);
  if (!user) throw authError(404, "User not found.");

  return {
    ...publicUser(user),
    hasPassword: Boolean(user.password),
    identities: (user.identities || []).map(({ provider, email, linkedAt }) => ({
      provider,
      email,
      linkedAt,
    })),
  };
}

export async function linkPassword(userId, newPassword, currentPassword = null) {
  const user = await User.findById(userId);
  if (!user) throw authError(404, "User not found.");

  if (user.password) {
    if (!currentPassword) {
      throw authError(400, "Current password is required to change password.");
    }
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) throw authError(401, "Incorrect current password.");
  }

  user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await user.save();

  return { message: "Password saved." };
}

export async function unlinkIdentity(userId, providerToUnlink) {
  const user = await User.findById(userId);
  if (!user) throw authError(404, "User not found.");

  if (!user.hasProvider(providerToUnlink)) {
    throw authError(400, `${providerLabel(providerToUnlink)} is not linked to this account.`);
  }

  const totalMethods = (user.password ? 1 : 0) + (user.identities?.length || 0);
  if (totalMethods <= 1) {
    throw authError(
      400,
      "Cannot remove your only sign-in method. Add another one before removing this one."
    );
  }

  if (providerToUnlink === "password") {
    user.password = null;
  } else {
    user.identities = user.identities.filter((id) => id.provider !== providerToUnlink);
    if (user.provider === providerToUnlink) {
      user.provider = user.identities[0]?.provider || (user.password ? "local" : null);
      user.providerId = user.identities[0]?.providerId || null;
    }
  }

  await user.save();
  return { message: `${providerLabel(providerToUnlink)} unlinked.` };
}

// ── Password recovery ────────────────────────────────────────

/**
 * Create a single-use reset token. Only sha256(token) is stored; the raw token
 * is returned so the caller can deliver it by email.
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: normalizeEmail(email) });
  if (!user) return { resetToken: null };

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = sha256(rawToken);
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  return { resetToken: rawToken };
}

/**
 * Set a new password from a valid reset token, then sign out every device.
 * Clicking the emailed link proves ownership of the address, so it is marked verified.
 */
export async function resetPasswordWithToken(rawToken, newPassword) {
  const user = await User.findOneAndUpdate(
    { passwordResetToken: sha256(rawToken), passwordResetExpires: { $gt: new Date() } },
    { passwordResetToken: null, passwordResetExpires: null },
    { new: true }
  );

  if (!user) {
    throw authError(400, "This reset link is invalid or has expired. Request a new one.");
  }

  user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.emailVerified = true;
  await user.save();
  await revokeAllUserSessions(user._id);

  return { message: "Password updated. Please log in with your new password." };
}
