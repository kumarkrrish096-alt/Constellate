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

// ── Token helpers ───────────────────────────────────────────

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
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function saveSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

// ── Authentication API Calls ────────────────────────────────

export const signUpWithEmail = async ({ name, email, password }) => {
  const res = await fetch(`${API}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json();

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

  const data = await res.json();

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

// ── Password Recovery & Profile Management ──────────────────

export const requestPasswordReset = async (email) => {
  const res = await fetch(`${API}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();

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

  const data = await res.json();

  if (!res.ok) {
    throw new AuthError(data.error || "Password reset failed");
  }

  return data;
};

export const getCurrentUserProfile = async () => {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    return null;
  }

  return res.json();
};
