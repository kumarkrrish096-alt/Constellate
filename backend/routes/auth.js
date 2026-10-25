import { Router } from "express";
import { z } from "zod";
import {
  registeruser,
  loginuser,
  getUserIdentities,
  linkPassword,
  unlinkIdentity,
  requestPasswordReset,
  resetPasswordWithToken,
} from "../services/auth.js";
import {
  startSession,
  refreshSession,
  endSession,
  revokeAllUserSessions,
  clearRefreshCookie,
} from "../services/session.js";
import { requireauth } from "../middleware/auth.js";
import {
  authLimiter,
  loginEmailLimiter,
  passwordResetLimiter,
  refreshLimiter,
} from "../middleware/ratelimit.js";
import { FRONTEND_URL, isProduction } from "../config/auth.js";

const router = Router();

// ── Validation schemas ──────────────────────────────────────

// bcrypt only reads the first 72 bytes; capping length also bounds hashing work.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");
const email = z.string().trim().max(254).email("Please enter a valid email");

const signupschema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email,
  password,
});

const loginschema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(1024),
  remember: z.boolean().optional(),
});

const linkPasswordSchema = z.object({
  newPassword: password,
  currentPassword: z.string().max(1024).optional(),
});

const forgotPasswordSchema = z.object({ email });

const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Reset link is invalid"),
  newPassword: password,
});

function validate(schema, body, res) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const errors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (!errors[field]) errors[field] = issue.message;
  }
  res.status(400).json({ error: result.error.issues[0]?.message || "Validation failed", errors });
  return null;
}

// Wraps a handler so thrown errors become JSON with the right status; unexpected
// errors are logged and answered with a generic message instead of internals.
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Auth route error:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};

// Cookie-authenticated endpoints only accept requests from our own frontend.
// Together with SameSite cookies this blocks cross-site request forgery.
function requireTrustedOrigin(req, res, next) {
  const origin = req.get("origin");
  if (origin && origin !== FRONTEND_URL) {
    return res.status(403).json({ error: "Request origin not allowed." });
  }
  next();
}

// ── Sign up / log in ────────────────────────────────────────

router.post("/signup", authLimiter, handle(async (req, res) => {
  const data = validate(signupschema, req.body, res);
  if (!data) return;

  const user = await registeruser(data.name, data.email, data.password);
  res.status(201).json(await startSession(res, user, req));
}));

router.post("/login", authLimiter, loginEmailLimiter, handle(async (req, res) => {
  const data = validate(loginschema, req.body, res);
  if (!data) return;

  const user = await loginuser(data.email, data.password);
  res.json(await startSession(res, user, req, { persistent: data.remember !== false }));
}));

// ── Session lifecycle ───────────────────────────────────────

// Swap the httpOnly refresh cookie for a fresh access token (rotates the cookie).
router.post("/refresh", refreshLimiter, requireTrustedOrigin, handle(async (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(await refreshSession(req, res));
}));

// Sign out this device only.
router.post("/logout", requireTrustedOrigin, handle(async (req, res) => {
  await endSession(req, res);
  res.json({ message: "Logged out." });
}));

// Sign out every device.
router.post("/logout-all", requireauth, handle(async (req, res) => {
  await revokeAllUserSessions(req.user.id);
  clearRefreshCookie(res);
  res.json({ message: "Logged out on all devices." });
}));

// ── Password recovery ───────────────────────────────────────

const RESET_SENT = "If an account exists for that email, a reset link has been sent.";

router.post("/forgot-password", passwordResetLimiter, handle(async (req, res) => {
  const data = validate(forgotPasswordSchema, req.body, res);
  if (!data) return;

  const { resetToken } = await requestPasswordReset(data.email);

  if (resetToken) {
    const link = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
    // TODO: deliver `link` by email (Resend, SES, Postmark...). Until then it is
    // printed in development only — a reset link in production logs is a takeover risk.
    if (!isProduction) console.log(`[dev] Password reset link for ${data.email}: ${link}`);
  }

  // Same answer whether or not the account exists, so this cannot list users.
  res.json({ message: RESET_SENT });
}));

router.post("/reset-password", passwordResetLimiter, handle(async (req, res) => {
  const data = validate(resetPasswordSchema, req.body, res);
  if (!data) return;

  res.json(await resetPasswordWithToken(data.token, data.newPassword));
}));

// ── Account (requires access token) ─────────────────────────

router.get("/me", requireauth, handle(async (req, res) => {
  res.json(await getUserIdentities(req.user.id));
}));

router.post("/identities/password", requireauth, handle(async (req, res) => {
  const data = validate(linkPasswordSchema, req.body, res);
  if (!data) return;

  res.json(await linkPassword(req.user.id, data.newPassword, data.currentPassword));
}));

router.delete("/identities/:provider", requireauth, handle(async (req, res) => {
  const { provider } = req.params;
  if (!["password", "google", "github"].includes(provider)) {
    return res.status(400).json({ error: "Invalid provider specified." });
  }

  res.json(await unlinkIdentity(req.user.id, provider));
}));

export default router;
