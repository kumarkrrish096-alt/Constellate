import { rateLimit, ipKeyGenerator } from "express-rate-limit";

// Counters live in memory, which is fine for one API process. With several
// API instances, give the limiter a shared store (e.g. rate-limit-redis).

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
