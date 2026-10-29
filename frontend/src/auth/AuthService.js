const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USER_KEY = "constellate_user";

let accessToken = null;
let refreshInFlight = null;

// Older builds kept the JWT itself in localStorage; remove it.
try { localStorage.removeItem("constellate_token"); } catch {}

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

function notifyAuthChange(user) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("constellate_auth", { detail: user }));
  }
}

export function getToken() {
  return accessToken;
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(getUser());
}

export function saveSession(data = {}) {
  accessToken = data?.accessToken || data?.token || null;
  if (data?.user) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch {}
  }
  notifyAuthChange(data?.user || null);
}

export function clearSession() {
  accessToken = null;
  try {
    localStorage.removeItem(USER_KEY);
  } catch {}
  notifyAuthChange(null);
}

async function readJson(response) {
  try {
    return await response.json();
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
        const response = await fetch(`${API}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        const data = await readJson(response);

        if (!response.ok || !data.accessToken) {
          accessToken = null;
          if (response.status === 401) clearSession();
          return null;
        }

        saveSession(data);
        return data.user || getUser();
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function restoreSession() {
  return (await refreshSession()) || getUser();
}

/** Called on /auth/callback: supports query params or refresh cookie. */
export async function completeOAuthSignIn(params) {
  if (params) {
    const token = typeof params.get === "function" ? params.get("token") : params.token;
    if (token) {
      const user = {
        id: typeof params.get === "function" ? params.get("id") : params.id,
        name: typeof params.get === "function" ? params.get("name") : params.name,
        email: typeof params.get === "function" ? params.get("email") : params.email,
      };
      saveSession({ accessToken: token, user });
      return user;
    }
  }
  return refreshSession();
}

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

  let response = await send();
  if (response.status === 401 && (await refreshSession())) {
    response = await send();
  }
  return response;
}

async function postAuth(path, body, fallbackMessage) {
  const response = await fetch(`${API}/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new AuthError(data.error || fallbackMessage, data.errors);
  }
  return data;
}

export async function signUpWithEmail({ name, email, password }) {
  const data = await postAuth("signup", { name, email, password }, "Signup failed");
  saveSession(data);
  return data;
}

export async function signInWithEmail({ email, password, remember = true }) {
  const data = await postAuth("login", { email, password, remember }, "Login failed");
  saveSession(data);
  return data;
}

export async function logout() {
  try {
    await fetch(`${API}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  } catch (error) {
    console.warn("Logout session revocation notification failed:", error);
  }
  clearSession();
}

/** Sign out of every device. */
export async function logoutEverywhere() {
  await authFetch("/api/auth/logout-all", { method: "POST" });
  clearSession();
}

// ── OAuth ───────────────────────────────────────────────────

export const signInWithProvider = (provider, mode = "login") => {
  window.location.href = `${API}/api/auth/${provider}?mode=${encodeURIComponent(mode)}`;
};

const PROVIDER_NAMES = { google: "Google", github: "GitHub" };

export function oauthErrorMessage(code, provider) {
  const name = PROVIDER_NAMES[provider] || "That provider";
  const messages = {
    oauth_cancelled: `${name} sign-in was cancelled.`,
    oauth_state: "That sign-in attempt expired or was started in another browser. Please try again.",
    oauth_failed: `${name} sign-in failed. Please try again.`,
    oauth_not_configured: `${name} sign-in isn't set up on this server yet.`,
    email_unverified: `Your ${name} account has no verified email address. Verify one with ${name}, then try again.`,
    provider_conflict: `This email is already linked to a different ${name} account.`,
    no_account: `No Constellate account found for this ${name} account. Please sign up first.`,
    account_exists: `You already have an account with this ${name} email. Please log in instead.`,
    session_failed: "We couldn't finish signing you in. Please try again.",
  };
  return messages[code] || "Sign-in failed. Please try again.";
}

// ── Password Recovery & Profile Management ──────────────────

export const requestPasswordReset = (email) =>
  postAuth("forgot-password", { email }, "Password reset request failed");

export const resetPassword = (token, newPassword) =>
  postAuth("reset-password", { token, newPassword }, "Password reset failed");

export const getCurrentUserProfile = async () => {
  try {
    const res = await authFetch("/api/auth/me");
    if (!res.ok) {
      if (res.status === 401) {
        clearSession();
      }
      return null;
    }
    return await readJson(res);
  } catch {
    return null;
  }
};
