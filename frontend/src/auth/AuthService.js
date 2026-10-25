// AuthService.js — real backend integration
// Handles email signup, email login, OAuth, password reset, and session management

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ── Error classes ───────────────────────────────────────────

export class AuthError extends Error {
  constructor(message, errors = null) {
    super(message);
    this.name = "AuthError";
    this.errors = errors;
  }
}

export class AuthNotConnectedError extends AuthError {
  constructor() {
    super("Authentication is not connected yet.");
    this.name = "AuthNotConnectedError";
  }
}

// ── Token & Session helpers ─────────────────────────────────

const TOKEN_KEY = "constellate_token";
const USER_KEY = "constellate_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isLoggedIn() {
  return !!getToken();
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

// ── Authentication API Calls ────────────────────────────────

export const signUpWithEmail = async ({ name, email, password }) => {
  const res = await fetch(`${API}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new AuthError(data.error || "Signup failed", data.errors);
  }

  saveSession(data);
  return data;
};

export const signInWithEmail = async ({ email, password }) => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new AuthError(data.error || "Login failed", data.errors);
  }

  saveSession(data);
  return data;
};

// OAuth — redirect to backend, which redirects to GitHub/Google
export const signInWithProvider = (provider, mode = "login") => {
  const url = `${API}/api/auth/${provider}?mode=${mode}`;
  window.location.href = url;
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

  if (!res.ok) {
    throw new AuthError(data.error || "Password reset request failed");
  }

  return data;
};

export const resetPassword = async (token, newPassword) => {
  const res = await fetch(`${API}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new AuthError(data.error || "Password reset failed");
  }

  return data;
};

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
