import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// In-memory counters: fine for a single server process. Behind several
// instances, give each limiter a shared store (e.g. rate-limit-redis).

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const tooMany = (message) => ({ error: message });

// Every credential-accepting endpoint, per IP.
export const authLimiter = rateLimit({
  windowMs: num("AUTH_RATE_WINDOW_MS", 15 * 60 * 1000),
  limit: num("AUTH_RATE_LIMIT", 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many attempts. Please wait a few minutes and try again."),
});

// Failed logins per target email, which stops password guessing against one
// account from many IPs. Successful logins do not count.
export const loginEmailLimiter = rateLimit({
  windowMs: num("LOGIN_EMAIL_RATE_WINDOW_MS", 15 * 60 * 1000),
  limit: num("LOGIN_EMAIL_RATE_LIMIT", 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    typeof req.body?.email === "string"
      ? `email:${req.body.email.toLowerCase().trim()}`
      : ipKeyGenerator(req.ip),
  message: tooMany("Too many failed attempts for this account. Please wait 15 minutes or reset your password."),
});

// Reset emails per IP; low because each one may send mail.
export const passwordResetLimiter = rateLimit({
  windowMs: num("PASSWORD_RESET_RATE_WINDOW_MS", 60 * 60 * 1000),
  limit: num("PASSWORD_RESET_RATE_LIMIT", 5),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many reset requests. Please try again later."),
});

export const refreshLimiter = rateLimit({
  windowMs: num("REFRESH_RATE_WINDOW_MS", 15 * 60 * 1000),
  limit: num("REFRESH_RATE_LIMIT", 120),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many requests. Please slow down."),
});

export const oauthLimiter = rateLimit({
  windowMs: num("OAUTH_RATE_WINDOW_MS", 15 * 60 * 1000),
  limit: num("OAUTH_RATE_LIMIT", 40),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many sign-in attempts. Please wait a few minutes."),
});

// Every analyze request costs two GitHub API calls (5,000/hour budget) and may
// queue a job, so each signed-in user gets a fixed number per window.
// Runs after requireauth, so req.user is set; falls back to the IP otherwise.
export const analyzelimiter = rateLimit({
  windowMs: num("ANALYZE_RATE_WINDOW_MS", 15 * 60 * 1000),
  limit: num("ANALYZE_RATE_LIMIT", 30),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: "Too many analysis requests, please wait a few minutes and try again" },
});

// Explanation requests may call a paid inference provider; keep usage bounded per account.
export const explanationlimiter = rateLimit({
  windowMs: num("EXPLANATION_RATE_WINDOW_MS", 15 * 60 * 1000),
  limit: num("EXPLANATION_RATE_LIMIT", 120),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: "Too many explanation requests. Please wait before trying again." },
});