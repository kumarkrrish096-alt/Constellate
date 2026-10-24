// Central auth settings. Values are read once at startup; assertAuthConfig()
// refuses to boot with a missing or weak secret instead of failing per request.

export const isProduction = process.env.NODE_ENV === "production";

export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

// Access token: short-lived JWT kept in memory by the frontend.
export const ACCESS_TOKEN_TTL = "15m";
export const JWT_ISSUER = "constellate-api";
export const JWT_AUDIENCE = "constellate-web";

// Refresh token: opaque random value in an httpOnly cookie, hashed in MongoDB.
export const REFRESH_COOKIE = "cst_rt";
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Server-side cap for "Remember me" unchecked, in case the browser restores the cookie.
export const SESSION_ONLY_TTL_MS = 24 * 60 * 60 * 1000;
// A rotated refresh token is still honoured this long, so two tabs refreshing
// at the same moment are not mistaken for token theft.
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;

// Short-lived cookie that carries OAuth state + PKCE verifier across the redirect.
export const OAUTH_COOKIE = "cst_oauth";
export const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;

// "lax" works when frontend and API share a site (localhost:5173 + localhost:5000,
// or app.example.com + api.example.com). Use "none" only for different sites.
const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();

export const baseCookieOptions = {
  httpOnly: true,
  secure: isProduction || sameSite === "none",
  sameSite,
  path: "/api/auth",
};

export const BCRYPT_ROUNDS = 12;

export function assertAuthConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long.");
  }
  if (isProduction && !process.env.FRONTEND_URL) {
    throw new Error("FRONTEND_URL must be set in production (used for CORS and redirects).");
  }
}
