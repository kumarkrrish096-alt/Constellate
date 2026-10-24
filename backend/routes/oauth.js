import crypto from "crypto";
import { Router } from "express";
import {
  FRONTEND_URL,
  OAUTH_COOKIE,
  OAUTH_COOKIE_TTL_MS,
  baseCookieOptions,
} from "../config/auth.js";
import {
  buildAuthorizeUrl,
  createOAuthAttempt,
  fetchProviderProfile,
  isProviderConfigured,
  resolveOAuthUser,
} from "../services/oauth.js";
import { startSession } from "../services/session.js";
import { oauthLimiter } from "../middleware/ratelimit.js";

const router = Router();

// The provider redirects back with a cross-site top-level GET, which only
// carries SameSite=Lax (or None) cookies, never Strict.
const oauthCookieOptions = {
  ...baseCookieOptions,
  sameSite: baseCookieOptions.sameSite === "none" ? "none" : "lax",
};

// Errors travel to the frontend as fixed codes, never free text, so a crafted
// link cannot make the login page display an attacker's message.
function redirectWithError(res, mode, provider, code) {
  const params = new URLSearchParams({ error: code, provider });
  res.redirect(`${FRONTEND_URL}/${mode}?${params}`);
}

const safeEqual = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function readAttempt(req) {
  try {
    return JSON.parse(req.cookies?.[OAUTH_COOKIE] || "null");
  } catch {
    return null;
  }
}

for (const provider of ["google", "github"]) {
  // Step 1: send the browser to the provider's consent screen.
  router.get(`/${provider}`, oauthLimiter, (req, res) => {
    const mode = req.query.mode === "signup" ? "signup" : "login";

    if (!isProviderConfigured(provider)) {
      return redirectWithError(res, mode, provider, "oauth_not_configured");
    }

    const attempt = createOAuthAttempt();
    res.cookie(
      OAUTH_COOKIE,
      JSON.stringify({ provider, mode, state: attempt.state, verifier: attempt.codeVerifier }),
      { ...oauthCookieOptions, maxAge: OAUTH_COOKIE_TTL_MS }
    );
    res.redirect(buildAuthorizeUrl(provider, attempt));
  });

  // Step 2: provider redirects back with ?code&state.
  router.get(`/${provider}/callback`, oauthLimiter, async (req, res) => {
    const attempt = readAttempt(req);
    res.clearCookie(OAUTH_COOKIE, oauthCookieOptions);

    const mode = attempt?.mode === "signup" ? "signup" : "login";
    const { code, state, error: providerError } = req.query;

    if (providerError) {
      const reason = providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed";
      return redirectWithError(res, mode, provider, reason);
    }

    // State must match the value this browser was given in step 1. Otherwise
    // the callback was started elsewhere (login CSRF) or the cookie expired.
    if (!attempt || attempt.provider !== provider || !safeEqual(attempt.state, state) || !code) {
      return redirectWithError(res, mode, provider, "oauth_state");
    }

    try {
      const profile = await fetchProviderProfile(provider, String(code), attempt.verifier);
      const user = await resolveOAuthUser(provider, profile, mode);
      await startSession(res, user, req);
      res.redirect(`${FRONTEND_URL}/auth/callback`);
    } catch (error) {
      if (!error.code) console.error(`${provider} OAuth error:`, error);
      redirectWithError(res, mode, provider, error.code || "oauth_failed");
    }
  });
}

export default router;
