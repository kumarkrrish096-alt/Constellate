import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// In-memory counters: fine for a single server process. Behind several
// instances, give each limiter a shared store (e.g. rate-limit-redis).

const tooMany = (message) => ({ error: message });

// Every credential-accepting endpoint, per IP.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many attempts. Please wait a few minutes and try again."),
});

// Failed logins per target email, which stops password guessing against one
// account from many IPs. Successful logins do not count.
export const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
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
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many reset requests. Please try again later."),
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many requests. Please slow down."),
});

export const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many sign-in attempts. Please wait a few minutes."),
});

// Every analyze request costs two GitHub API calls (5,000/hour budget) and may
// queue a job, so each signed-in user gets a fixed number per window.
// Runs after requireauth, so req.user is set; falls back to the IP otherwise.
export const analyzelimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: "Too many analysis requests, please wait a few minutes and try again" },
});

// Explanation requests may call a paid inference provider; keep usage bounded per account.
export const explanationlimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: "Too many explanation requests. Please wait before trying again." },
});