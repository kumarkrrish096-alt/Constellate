import User from "../models/user.js";
import { generatetoken } from "./auth.js";

// ── Google OAuth ────────────────────────────────────────────

/**
 * Handles the Google OAuth authorization code exchange, profile retrieval,
 * and safe identity resolution.
 */
export async function handleGoogleCallback(code, mode = "login") {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.BACKEND_URL || "http://localhost:5000"}/api/auth/google/callback`,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    throw new Error(`Google authorization failed: ${tokenData.error_description || tokenData.error}`);
  }

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!profileRes.ok) {
    throw new Error("Failed to retrieve user profile from Google.");
  }

  const profile = await profileRes.json();

  if (!profile.email) {
    throw new Error("Could not retrieve an email address from your Google account.");
  }

  if (profile.verified_email === false) {
    throw new Error("Your Google email is not verified. Please verify it with Google before signing in.");
  }

  const googleId = String(profile.id);
  const normalizedEmail = profile.email.toLowerCase().trim();

  return resolveOAuthIdentity({
    provider: "google",
    providerId: googleId,
    email: normalizedEmail,
    name: profile.name || profile.email.split("@")[0],
    emailVerified: true,
    mode,
  });
}

// ── GitHub OAuth ────────────────────────────────────────────

/**
 * Handles GitHub OAuth authorization code exchange, private/noreply email resolution,
 * and safe identity resolution.
 */
export async function handleGithubCallback(code, mode = "login") {
  // 1. Exchange temporary code for an access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error) {
    throw new Error(`GitHub authorization failed: ${tokenData.error_description || tokenData.error}`);
  }

  // 2. Fetch user profile
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "Constellate-Auth",
    },
  });

  if (!userRes.ok) {
    throw new Error("Failed to retrieve user profile from GitHub.");
  }

  const profile = await userRes.json();
  const githubId = String(profile.id);

  // 3. Resolve user email (handling private, public, and unverified emails)
  let resolvedEmail = null;
  let isVerified = false;

  // Case A: Public email is on the profile
  if (profile.email) {
    resolvedEmail = profile.email;
    isVerified = true;
  }

  // Case B: Public email is hidden/private — query /user/emails
  if (!resolvedEmail) {
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "Constellate-Auth",
      },
    });

    if (emailsRes.ok) {
      const emails = await emailsRes.json();

      // Priority 1: Primary and verified
      const primaryVerified = emails.find((e) => e.primary && e.verified);
      // Priority 2: Any verified email
      const anyVerified = emails.find((e) => e.verified);

      if (primaryVerified) {
        resolvedEmail = primaryVerified.email;
        isVerified = true;
      } else if (anyVerified) {
        resolvedEmail = anyVerified.email;
        isVerified = true;
      } else if (emails.length > 0 && !emails.some((e) => e.verified)) {
        throw new Error(
          "Your GitHub account does not have a verified email address. Please verify your email on GitHub before continuing."
        );
      }
    }
  }

  if (!resolvedEmail) {
    throw new Error("Could not retrieve a valid email address from your GitHub account.");
  }

  const normalizedEmail = resolvedEmail.toLowerCase().trim();
  const displayName = profile.name?.trim() || profile.login;

  // 4. Resolve identity through unified anti-auto-merge policy
  return resolveOAuthIdentity({
    provider: "github",
    providerId: githubId,
    email: normalizedEmail,
    name: displayName,
    emailVerified: isVerified,
    mode,
  });
}

// ── Shared Identity Resolution Policy ────────────────────────

/**
 * Enforces strict account identity and linking policies:
 * - Existing linked identity -> Login
 * - Matching email on different provider -> Reject auto-merge & instruct user
 * - New user on login -> Reject (must signup first)
 * - New user on signup -> Create unified user with identities array
 */
export async function resolveOAuthIdentity({ provider, providerId, email, name, emailVerified, mode }) {
  // Step A: Look up user by immutable OAuth provider identity
  let user = await User.findByIdentity(provider, providerId);

  if (user) {
    // User already has this Google/GitHub identity linked — proceed to login
    const token = generatetoken(user);
    return {
      token,
      user: { id: user._id, name: user.name, email: user.email },
    };
  }

  // Step B: Check if an account already exists with this email address
  const existingByEmail = await User.findOne({ email });

  if (existingByEmail) {
    // If the provider has verified this email address, safely auto-link this identity!
    if (emailVerified) {
      if (!Array.isArray(existingByEmail.identities)) {
        existingByEmail.identities = [];
      }

      const existingIdentityIndex = existingByEmail.identities.findIndex(
        (id) => id.provider === provider
      );

      if (existingIdentityIndex >= 0) {
        existingByEmail.identities[existingIdentityIndex].providerId = String(providerId);
        existingByEmail.identities[existingIdentityIndex].email = email;
      } else {
        existingByEmail.identities.push({
          provider,
          providerId: String(providerId),
          email,
          linkedAt: new Date(),
        });
      }

      if (!existingByEmail.emailVerified) {
        existingByEmail.emailVerified = true;
      }

      await existingByEmail.save();

      const token = generatetoken(existingByEmail);
      return {
        token,
        user: { id: existingByEmail._id, name: existingByEmail.name, email: existingByEmail.email },
      };
    }

    // If the provider did not verify the email, reject auto-merging to prevent email spoofing
    const existingMethods = [];
    if (existingByEmail.password) existingMethods.push("password");
    if (existingByEmail.identities?.length) {
      existingByEmail.identities.forEach((id) => existingMethods.push(id.provider));
    } else if (existingByEmail.provider && existingByEmail.provider !== "local") {
      existingMethods.push(existingByEmail.provider);
    }

    const methodNames = existingMethods.join(" or ") || "another method";

    const error = new Error(
      `An account with this email already exists using ${methodNames}. ` +
      `Your ${provider} email is unverified, so it cannot be automatically linked. Please log in with ${methodNames} first.`
    );
    error.status = 409;
    throw error;
  }

  // Step C: No account exists with this identity or email
  if (mode === "login") {
    const error = new Error("No account found with this email. Please sign up first.");
    error.status = 404;
    throw error;
  }

  // Step D: Create new account in signup mode
  user = await User.create({
    name,
    email,
    emailVerified: Boolean(emailVerified),
    password: null, // OAuth-only user has no password initially
    identities: [
      {
        provider,
        providerId,
        email,
        linkedAt: new Date(),
      },
    ],
    tokenVersion: 0,
    provider, // Retained for backward-compatibility
    providerId,
  });

  const token = generatetoken(user);

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email },
  };
}
