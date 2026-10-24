import jwt from "jsonwebtoken";
import User from "../models/user.js";

/**
 * Authentication middleware that verifies the JWT and validates
 * that the user's session has not been revoked (via tokenVersion).
 */
export async function requireauth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    // 1. Verify token cryptographic signature
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 2. Verify user still exists and check tokenVersion for session revocation
    const user = await User.findById(payload.id).select("email name tokenVersion").lean();
    if (!user) {
      return res.status(401).json({ error: "User account no longer exists." });
    }

    // If tokenVersion in the token does not match the database, the session was revoked
    if (
      payload.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      payload.tokenVersion !== user.tokenVersion
    ) {
      return res.status(401).json({ error: "Session has expired or been revoked. Please log in again." });
    }

    // 3. Attach authenticated user details to request
    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired session token." });
  }
}
