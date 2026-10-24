import { Router } from "express";
import dotenv from "dotenv";
import { handleGithubCallback, handleGoogleCallback } from "../services/oauth.js";

const router = Router();

const getFrontendUrl = () => {
  dotenv.config();
  return process.env.FRONTEND_URL || "http://localhost:5173";
};

const getBackendUrl = () => {
  dotenv.config();
  return process.env.BACKEND_URL || "http://localhost:5000";
};

// ── Google OAuth Routes ─────────────────────────────────────

// Step 1: Redirect user to Google consent screen
router.get("/google", (req, res) => {
  dotenv.config();
  const mode = req.query.mode === "signup" ? "signup" : "login";

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(
      `${getFrontendUrl()}/${mode}?error=${encodeURIComponent(
        "Google OAuth is not configured yet. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env"
      )}`
    );
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${getBackendUrl()}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: mode,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Step 2: Google redirects back with code
router.get("/google/callback", async (req, res) => {
  dotenv.config();
  const { code, state, error: googleError } = req.query;
  const mode = state === "signup" ? "signup" : "login";

  if (googleError || !code) {
    return res.redirect(`${getFrontendUrl()}/${mode}?error=Google+login+cancelled`);
  }

  try {
    const data = await handleGoogleCallback(code, mode);

    const query = new URLSearchParams({
      token: data.token,
      name: data.user?.name || "",
      email: data.user?.email || "",
      id: String(data.user?.id || ""),
    });

    res.redirect(`${getFrontendUrl()}/auth/callback?${query}`);
  } catch (error) {
    console.error("Google OAuth error:", error.message);
    res.redirect(`${getFrontendUrl()}/${mode}?error=${encodeURIComponent(error.message)}`);
  }
});

// ── GitHub OAuth Routes ─────────────────────────────────────

router.get("/github", (req, res) => {
  dotenv.config();
  const mode = req.query.mode === "signup" ? "signup" : "login";

  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.redirect(
      `${getFrontendUrl()}/${mode}?error=${encodeURIComponent(
        "GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in backend/.env"
      )}`
    );
  }

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${getBackendUrl()}/api/auth/github/callback`,
    scope: "read:user user:email",
    state: mode,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get("/github/callback", async (req, res) => {
  dotenv.config();
  const { code, state } = req.query;
  const mode = state === "signup" ? "signup" : "login";

  if (!code) {
    return res.redirect(`${getFrontendUrl()}/${mode}?error=GitHub+login+cancelled`);
  }

  try {
    const data = await handleGithubCallback(code, mode);

    const query = new URLSearchParams({
      token: data.token,
      name: data.user?.name || "",
      email: data.user?.email || "",
      id: String(data.user?.id || ""),
    });

    res.redirect(`${getFrontendUrl()}/auth/callback?${query}`);
  } catch (error) {
    console.error("GitHub OAuth error:", error.message);
    res.redirect(`${getFrontendUrl()}/${mode}?error=${encodeURIComponent(error.message)}`);
  }
});

export default router;
