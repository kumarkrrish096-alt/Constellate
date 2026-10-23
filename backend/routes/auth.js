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
  revokeAllSessions,
} from "../services/auth.js";
import { requireauth } from "../middleware/auth.js";

const router = Router();

// ── Validation schemas ──────────────────────────────────────

const signupschema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginschema = z.object({
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const linkPasswordSchema = z.object({
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  currentPassword: z.string().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Please enter a valid email"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

// ── Public Routes ───────────────────────────────────────────

router.post("/signup", async (req, res) => {
  const result = signupschema.safeParse(req.body);

  if (!result.success) {
    const errors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (!errors[field]) errors[field] = issue.message;
    }
    return res.status(400).json({ error: "Validation failed", errors });
  }

  try {
    const data = await registeruser(
      result.data.name,
      result.data.email,
      result.data.password
    );
    res.status(201).json(data);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const result = loginschema.safeParse(req.body);

  if (!result.success) {
    const errors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (!errors[field]) errors[field] = issue.message;
    }
    return res.status(400).json({ error: "Validation failed", errors });
  }

  try {
    const data = await loginuser(result.data.email, result.data.password);
    res.json(data);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  const result = forgotPasswordSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const response = await requestPasswordReset(result.data.email);

    // In development mode, log the reset token to console for easy testing
    if (response.resetToken) {
      console.log(`🔑 [Dev] Password Reset Link: ${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${response.resetToken}`);
    }

    res.json({ message: response.message });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

router.post("/reset-password", async (req, res) => {
  const result = resetPasswordSchema.safeParse(req.body);

  if (!result.success) {
    const message = result.error.issues[0]?.message || "Invalid input";
    return res.status(400).json({ error: message });
  }

  try {
    const response = await resetPasswordWithToken(
      result.data.token,
      result.data.newPassword
    );
    res.json(response);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// ── Protected Routes (Require Valid Session) ────────────────

router.post("/logout", requireauth, async (req, res) => {
  try {
    const response = await revokeAllSessions(req.user.id);
    res.json(response);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

router.get("/me", requireauth, async (req, res) => {
  try {
    const profile = await getUserIdentities(req.user.id);
    res.json(profile);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

router.get("/identities", requireauth, async (req, res) => {
  try {
    const identities = await getUserIdentities(req.user.id);
    res.json(identities);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

router.post("/identities/password", requireauth, async (req, res) => {
  const result = linkPasswordSchema.safeParse(req.body);

  if (!result.success) {
    const message = result.error.issues[0]?.message || "Invalid password";
    return res.status(400).json({ error: message });
  }

  try {
    const response = await linkPassword(
      req.user.id,
      result.data.newPassword,
      result.data.currentPassword
    );
    res.json(response);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

router.delete("/identities/:provider", requireauth, async (req, res) => {
  const { provider } = req.params;
  const allowed = ["password", "google", "github"];

  if (!allowed.includes(provider)) {
    return res.status(400).json({ error: "Invalid provider specified." });
  }

  try {
    const response = await unlinkIdentity(req.user.id, provider);
    res.json(response);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

export default router;
