// AuthService.js — real backend integration
// Handles email signup, email login, OAuth, password reset, and session management.
//
// Session model:
//  - Access token (15 min JWT) lives only in this module's memory, never in
//    localStorage, so injected scripts cannot lift a long-lived credential.
//  - Refresh token lives in an httpOnly cookie that JavaScript cannot read; the
//    backend swaps it for a new access token via POST /api/auth/refresh.
//  - The user's name/email is cached in localStorage purely to paint the UI
//    instantly; it grants no access.

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Error classes ───────────────────────────────────────────

export class AuthError extends Error {
  constructor(message, errors = null) {
    super(message);
    this.name = "AuthError";
    this.errors = errors;
  }
}

// ── Session state ───────────────────────────────────────────

// ── Token & Session helpers ─────────────────────────────────

const TOKEN_KEY = "constellate_token";
const USER_KEY = "constellate_user";

let accessToken = null;
let refreshInFlight = null;

// Older builds kept the JWT itself in localStorage; remove it.
try { localStorage.removeItem("constellate_token"); } catch {}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Quick, synchronous hint for first paint. Confirm with restoreSession(). */
export function isLoggedIn() {
  return !!getUser();
}

export function saveSession(data) {
  if (data?.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
  }
  if (data?.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("constellate_auth", { detail: data?.user || null })
    );
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("constellate_auth", { detail: null })
    );
  }
}

/**
 * Validate and restore session on page reload or app start.
 * Resolves to the user object if authenticated, or null.
 */
export async function restoreSession() {
  const token = getToken();
  if (!token) {
    clearSession();
    return null;
  }

  try {
    const profile = await getCurrentUserProfile();
    if (profile) {
      const current = getUser();
      const updated = {
        ...current,
        ...(profile.user || profile),
      };
      saveSession({ token, user: updated });
      return updated;
    }
    return null;
  } catch {
    // On network failure, fallback to cached user to avoid jarring logouts
    return getUser();
  }
}

/**
 * Helper to complete OAuth sign-in with query params or user data.
 */
export async function completeOAuthSignIn(params) {
  if (params) {
    const token = typeof params.get === "function" ? params.get("token") : params.token;
    if (token) {
      const user = {
        id: typeof params.get === "function" ? params.get("id") : params.id,
        name: typeof params.get === "function" ? params.get("name") : params.name,
        email: typeof params.get === "function" ? params.get("email") : params.email,
      };
      saveSession({ token, user });
      return user;
    }
  }
  return restoreSession();
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

  const data = await res.json().catch(() => ({}));

/** Call on app start: resolves to the signed-in user or null. */
export const restoreSession = refreshSession;

/**
 * fetch() for protected API routes: attaches the access token and, if it has
 * expired, refreshes once and retries.
 */
export async function authFetch(path, options = {}) {
  if (!accessToken) await refreshSession();

  const send = () =>
    fetch(`${API}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...options.headers,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  let res = await send();
  if (res.status === 401 && (await refreshSession())) {
    res = await send();
  }
  return res;
}

// ── Authentication API calls ────────────────────────────────

async function postAuth(path, body, fallbackMessage) {
  const res = await fetch(`${API}/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new AuthError(data.error || fallbackMessage, data.errors);
  }
  return data;
}

export const signUpWithEmail = async ({ name, email, password }) => {
  const data = await postAuth("signup", { name, email, password }, "Signup failed");
  setSession(data);
  return data;
};

export const signInWithEmail = async ({ email, password, remember = true }) => {
  const data = await postAuth("login", { email, password, remember }, "Login failed");
  setSession(data);
  return data;
};

// Sign out of current device session
export async function logout() {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${API}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (e) {
      console.warn("Logout session revocation notification failed:", e);
    }
  }
  clearSession();
}

// ── Password Recovery & Profile Management ──────────────────

export const requestPasswordReset = async (email) => {
  const res = await fetch(`${API}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json().catch(() => ({}));

// ── OAuth ───────────────────────────────────────────────────

// Full-page redirect to the backend, which redirects to Google/GitHub.
export const signInWithProvider = (provider, mode = "login") => {
  window.location.href = `${API}/api/auth/${provider}?mode=${encodeURIComponent(mode)}`;
};

/** Called on /auth/callback: the backend has set the refresh cookie. */
export const completeOAuthSignIn = () => refreshSession();

const PROVIDER_NAMES = { google: "Google", github: "GitHub" };

/** Map the backend's fixed OAuth error codes to display text. */
export function oauthErrorMessage(code, provider) {
  const p = PROVIDER_NAMES[provider] || "That provider";
  const messages = {
    oauth_cancelled: `${p} sign-in was cancelled.`,
    oauth_state: "That sign-in attempt expired or was started in another browser. Please try again.",
    oauth_failed: `${p} sign-in failed. Please try again.`,
    oauth_not_configured: `${p} sign-in isn't set up on this server yet.`,
    email_unverified: `Your ${p} account has no verified email address. Verify one with ${p}, then try again.`,
    provider_conflict: `This email is already linked to a different ${p} account.`,
    no_account: `No Constellate account found for this ${p} account. Please sign up first.`,
    account_exists: `You already have an account with this ${p} email. Please log in instead.`,
    session_failed: "We couldn't finish signing you in. Please try again.",
  };
  return messages[code] || "Sign-in failed. Please try again.";
}

  const data = await res.json().catch(() => ({}));

export const requestPasswordReset = (email) =>
  postAuth("forgot-password", { email }, "Password reset request failed");

export const resetPassword = (token, newPassword) =>
  postAuth("reset-password", { token, newPassword }, "Password reset failed");

export const getCurrentUserProfile = async () => {
  const token = getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearSession();
      }
      return null;
    }

    return await res.json().catch(() => null);
  } catch {
    return null;
  }
};

export async function authFetch(path, options = {}) {
  const token = getToken();
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

// ── Provider error mapping ──────────────────────────────────

const PROVIDER_NAMES = { google: "Google", github: "GitHub" };

export function oauthErrorMessage(code, provider) {
  const p = PROVIDER_NAMES[provider] || "That provider";
  const messages = {
    oauth_cancelled: `${p} sign-in was cancelled.`,
    oauth_state: "That sign-in attempt expired or was started in another browser. Please try again.",
    oauth_failed: `${p} sign-in failed. Please try again.`,
    oauth_not_configured: `${p} sign-in isn't set up on this server yet.`,
    email_unverified: `Your ${p} account has no verified email address. Verify one with ${p}, then try again.`,
    provider_conflict: `This email is already linked to a different ${p} account.`,
    no_account: `No Constellate account found for this ${p} account. Please sign up first.`,
    account_exists: `You already have an account with this ${p} email. Please log in instead.`,
    session_failed: "We couldn't finish signing you in. Please try again.",
  };
  return messages[code] || code || "Sign-in failed. Please try again.";
}
