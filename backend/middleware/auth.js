import Session from "../models/session.js";
import User from "../models/user.js";
import { verifyAccessToken } from "../services/session.js";

/**
 * Verifies the short-lived access token (Authorization: Bearer ...) and checks
 * that its session still exists, so logging out a device takes effect at once
 * rather than when the token expires.
 */
export async function requireauth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }

  let payload;
  try {
    payload = verifyAccessToken(authHeader.slice("Bearer ".length));
  } catch {
    return res.status(401).json({ error: "Invalid or expired session token.", code: "token_expired" });
  }

  try {
    const [sessionExists, user] = await Promise.all([
      Session.exists({ _id: payload.sid, userId: payload.sub }),
      User.findById(payload.sub).select("email name").lean(),
    ]);

    if (!sessionExists || !user) {
      return res.status(401).json({ error: "Session has ended. Please log in again.", code: "session_revoked" });
    }

    req.user = { id: user._id, email: user.email, name: user.name };
    req.sessionId = payload.sid;
    next();
  } catch (error) {
    next(error);
  }
}
