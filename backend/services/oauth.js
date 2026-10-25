import crypto from "crypto";
import User from "../models/user.js";
import { BACKEND_URL } from "../config/auth.js";
import { authError, providerLabel } from "./auth.js";
import { revokeAllUserSessions } from "./session.js";

// ── Providers ───────────────────────────────────────────────

const PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    extraParams: { prompt: "select_account" },
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // user:email is the only scope needed: /user is readable without one,
    // and /user/emails needs it to see verified (including private) addresses.
    scope: "user:email",
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    // GitHub skips its consent screen once a user has approved the app; the
    // account picker at least makes them confirm which account to use.
    extraParams: { allow_signup: "true", prompt: "select_account" },
  },
};

export const isSupportedProvider = (provider) => Object.hasOwn(PROVIDERS, provider);

export function isProviderConfigured(provider) {
  const p = PROVIDERS[provider];
  return Boolean(p.clientId() && p.clientSecret());
}

const redirectUri = (provider) => `${BACKEND_URL}/api/auth/${provider}/callback`;

/**
 * Fresh per-attempt secrets: `state` defeats login CSRF, the PKCE verifier
 * makes a stolen authorization code useless to anyone but this browser.
 */
export function createOAuthAttempt() {
  const state = crypto.randomBytes(32).toString("base64url");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { state, codeVerifier, codeChallenge };
}

export function buildAuthorizeUrl(provider, { state, codeChallenge }) {
  const p = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: p.clientId(),
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: p.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...p.extraParams,
  });
  return `${p.authorizeUrl}?${params}`;
}

async function exchangeCode(provider, code, codeVerifier) {
  const p = PROVIDERS[provider];
  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: p.clientId(),
      client_secret: p.clientSecret(),
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(provider),
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    console.error(`${provider} token exchange failed:`, data.error || res.status, data.error_description || "");
    throw authError(502, `${providerLabel(provider)} sign-in failed. Please try again.`, "oauth_failed");
  }
  return data;
}

// ── Google (OpenID Connect) ─────────────────────────────────

function decodeJwtPayload(jwt) {
  const [, payload] = String(jwt).split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

async function fetchGoogleProfile(code, codeVerifier) {
  const tokens = await exchangeCode("google", code, codeVerifier);

  // The ID token came straight from Google's token endpoint over TLS, so its
  // signature need not be re-verified (per Google's OIDC docs). Claims still are.
  let claims;
  try {
    claims = decodeJwtPayload(tokens.id_token);
  } catch {
    throw authError(502, "Google sign-in failed. Please try again.", "oauth_failed");
  }

  const validIssuer = ["https://accounts.google.com", "accounts.google.com"].includes(claims.iss);
  const validAudience = claims.aud === process.env.GOOGLE_CLIENT_ID;
  const notExpired = typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
  if (!validIssuer || !validAudience || !notExpired || !claims.sub) {
    throw authError(502, "Google sign-in failed. Please try again.", "oauth_failed");
  }

  return {
    providerId: String(claims.sub),
    email: claims.email,
    emailVerified: claims.email_verified === true,
    name: claims.name,
  };
}

// ── GitHub ──────────────────────────────────────────────────

async function githubGet(path, accessToken) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Constellate-Auth",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw authError(502, "Could not read your GitHub profile. Please try again.", "oauth_failed");
  }
  return res.json();
}

async function fetchGithubProfile(code, codeVerifier) {
  const { access_token: accessToken } = await exchangeCode("github", code, codeVerifier);

  const [profile, emails] = await Promise.all([
    githubGet("/user", accessToken),
    githubGet("/user/emails", accessToken),
  ]);

  // Only ever trust an address GitHub reports as verified; prefer the primary one.
  const verified = emails.filter((e) => e.verified && !e.email.endsWith("@users.noreply.github.com"));
  const chosen = verified.find((e) => e.primary) || verified[0];

  return {
    providerId: String(profile.id),
    email: chosen?.email || null,
    emailVerified: Boolean(chosen),
    name: profile.name?.trim() || profile.login,
  };
}

export async function fetchProviderProfile(provider, code, codeVerifier) {
  return provider === "google"
    ? fetchGoogleProfile(code, codeVerifier)
    : fetchGithubProfile(code, codeVerifier);
}

// ── Account resolution ──────────────────────────────────────

/**
 * Turn a provider profile into a Constellate user:
 *  0. Signup with an account that already exists (by identity or email)
 *                                               → refuse, the user must log in instead.
 *  1. Provider identity already linked          → that user.
 *  2. Provider email unverified / missing       → refuse (cannot prove ownership).
 *  3. Account with the same email exists        → link this identity to it.
 *     If that account's email was never verified, whoever set its password never
 *     proved they own the inbox (the "pre-account-hijacking" attack), so the
 *     password and its sessions are removed; the verified owner keeps the account.
 *  4. No account at all                          → login: refuse, the user must sign up first.
 *                                                 signup: create a new account.
 */
export async function resolveOAuthUser(provider, profile, mode = "login") {
  const label = providerLabel(provider);

  const accountExists = () =>
    authError(409, "An account already exists for this email. Please log in instead.", "account_exists");

  const linked = await User.findByIdentity(provider, profile.providerId);
  if (linked) {
    if (mode === "signup") throw accountExists();
    return linked;
  }

  if (!profile.email || !profile.emailVerified) {
    throw authError(
      403,
      `Your ${label} account has no verified email address. Verify one with ${label} and try again.`,
      "email_unverified"
    );
  }

  const email = profile.email.toLowerCase().trim();
  const name = profile.name?.trim() || email.split("@")[0];
  const existing = await User.findOne({ email });

  if (existing) {
    if (mode === "signup") throw accountExists();

    if (existing.identities?.some((id) => id.provider === provider)) {
      throw authError(
        409,
        `This email is already linked to a different ${label} account.`,
        "provider_conflict"
      );
    }

    existing.identities.push({ provider, providerId: profile.providerId, email, linkedAt: new Date() });

    if (!existing.emailVerified) {
      if (existing.password) {
        existing.password = null;
        await revokeAllUserSessions(existing._id);
        console.warn(`Cleared unverified password on ${existing._id} after verified ${provider} sign-in`);
      }
      existing.emailVerified = true;
    }

    await existing.save();
    return existing;
  }

  if (mode !== "signup") {
    throw authError(404, `No account is linked to this ${label} account. Please sign up first.`, "no_account");
  }

  try {
    return await User.create({
      name,
      email,
      emailVerified: true,
      password: null,
      identities: [{ provider, providerId: profile.providerId, email, linkedAt: new Date() }],
      provider,
      providerId: profile.providerId,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw authError(409, "That account was just created. Please try again.", "oauth_failed");
    }
    throw error;
  }
}
