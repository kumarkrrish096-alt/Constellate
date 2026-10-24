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

function setSession({ accessToken: token, user }) {
  accessToken = token;
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch {}
}

function clearSession() {
  accessToken = null;
  try { localStorage.removeItem(USER_KEY); } catch {}
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ── Token refresh ───────────────────────────────────────────

/**
 * Exchange the refresh cookie for a new access token. Concurrent callers share
 * one request, so a burst of 401s triggers a single refresh.
 * Resolves to the user, or null when there is no valid session.
 */
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          clearSession();
          return null;
        }
        const data = await readJson(res);
        setSession(data);
        return data.user;
      } catch {
        // Network failure: keep the cached user, the next call will retry.
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

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
  const data = await readJson(res);
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

/** Sign out of this device. */
export async function logout() {
  try {
    await fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" });
  } catch (e) {
    console.warn("Logout request failed:", e);
  }
  clearSession();
}

/** Sign out of every device. */
export async function logoutEverywhere() {
  await authFetch("/api/auth/logout-all", { method: "POST" });
  clearSession();
}

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

// ── Password recovery & profile ─────────────────────────────

export const requestPasswordReset = (email) =>
  postAuth("forgot-password", { email }, "Password reset request failed");

export const resetPassword = (token, newPassword) =>
  postAuth("reset-password", { token, newPassword }, "Password reset failed");

export const getCurrentUserProfile = async () => {
  const res = await authFetch("/api/auth/me");
  if (!res.ok) return null;
  return res.json();
};
