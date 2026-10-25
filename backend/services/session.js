import crypto from "crypto";
import jwt from "jsonwebtoken";
import Session from "../models/session.js";
import User from "../models/user.js";
import {
  ACCESS_TOKEN_TTL,
  JWT_ISSUER,
  JWT_AUDIENCE,
  REFRESH_COOKIE,
  REFRESH_TTL_MS,
  REFRESH_REUSE_GRACE_MS,
  SESSION_ONLY_TTL_MS,
  baseCookieOptions,
} from "../config/auth.js";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const newRefreshToken = () => crypto.randomBytes(32).toString("base64url");

export function signAccessToken(userId, sessionId) {
  return jwt.sign({ sid: String(sessionId) }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    subject: String(userId),
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function publicUser(user) {
  const providers = [];
  if (user.password) providers.push("password");
  for (const id of user.identities || []) {
    if (!providers.includes(id.provider)) providers.push(id.provider);
  }
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    providers,
  };
}

// Without maxAge the browser treats it as a session cookie and drops it on close.
function setRefreshCookie(res, token, persistent) {
  res.cookie(REFRESH_COOKIE, token, persistent ? { ...baseCookieOptions, maxAge: REFRESH_TTL_MS } : baseCookieOptions);
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
}

/**
 * Start a new device session: stores the hashed refresh token, sets the
 * httpOnly cookie, and returns the access token + public user for the response body.
 */
export async function startSession(res, user, req, { persistent = true } = {}) {
  const refreshToken = newRefreshToken();
  const session = await Session.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    persistent,
    expiresAt: new Date(Date.now() + (persistent ? REFRESH_TTL_MS : SESSION_ONLY_TTL_MS)),
    userAgent: req.get("user-agent")?.slice(0, 256) || null,
    ip: req.ip || null,
  });

  setRefreshCookie(res, refreshToken, persistent);
  return {
    accessToken: signAccessToken(user._id, session._id),
    user: publicUser(user),
  };
}

const sessionError = () => {
  const error = new Error("Your session has expired. Please log in again.");
  error.status = 401;
  return error;
};

/**
 * Exchange the refresh cookie for a new access token, rotating the refresh token.
 * A rotated-out token presented after the grace window means it was copied
 * (stolen), so the whole session is destroyed.
 */
export async function refreshSession(req, res) {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (!presented) throw sessionError();

  const hash = sha256(presented);
  const now = Date.now();

  let session = await Session.findOne({ tokenHash: hash });

  if (!session) {
    const rotated = await Session.findOne({ prevTokenHash: hash });
    if (rotated && rotated.rotatedAt && now - rotated.rotatedAt.getTime() < REFRESH_REUSE_GRACE_MS) {
      // A parallel request already rotated this token; the browser holds the new
      // cookie, so just hand out an access token for the same session.
      const user = await User.findById(rotated.userId);
      if (!user) throw sessionError();
      return { accessToken: signAccessToken(user._id, rotated._id), user: publicUser(user) };
    }
    if (rotated) {
      await Session.deleteOne({ _id: rotated._id });
      console.warn(`Refresh token reuse detected; revoked session ${rotated._id}`);
    }
    clearRefreshCookie(res);
    throw sessionError();
  }

  if (session.expiresAt.getTime() <= now) {
    await Session.deleteOne({ _id: session._id });
    clearRefreshCookie(res);
    throw sessionError();
  }

  const user = await User.findById(session.userId);
  if (!user) {
    await Session.deleteOne({ _id: session._id });
    clearRefreshCookie(res);
    throw sessionError();
  }

  const nextToken = newRefreshToken();
  // Conditional update so two concurrent rotations cannot both win.
  const updated = await Session.findOneAndUpdate(
    { _id: session._id, tokenHash: hash },
    {
      tokenHash: sha256(nextToken),
      prevTokenHash: hash,
      rotatedAt: new Date(now),
      lastUsedAt: new Date(now),
    },
    { returnDocument: "after" }
  );
  if (updated) setRefreshCookie(res, nextToken, session.persistent !== false);

  return { accessToken: signAccessToken(user._id, session._id), user: publicUser(user) };
}

export async function endSession(req, res) {
  const presented = req.cookies?.[REFRESH_COOKIE];
  if (presented) {
    await Session.deleteOne({ tokenHash: sha256(presented) });
  }
  clearRefreshCookie(res);
}

export async function revokeAllUserSessions(userId) {
  await Session.deleteMany({ userId });
}
