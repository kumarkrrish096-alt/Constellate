import "dotenv/config";
import express from "express"
import cors from "cors";

import jobstatusrouter from "./routes/jobstatus.js"

import { connectdb } from "./db/connect.js";
import healthrouter from "./routes/health.js";
import analyzerouter from "./routes/analyze.js";
import snapshotsrouter from "./routes/snapshots.js";
import authrouter from "./routes/auth.js";
import oauthrouter from "./routes/oauth.js";
import { requireauth } from "./middleware/auth.js";
import { analyzelimiter } from "./middleware/ratelimit.js";

const app=express();
const PORT=process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());



// Public routes (no token needed)
app.use("/health", healthrouter);
app.use("/api/auth", authrouter);
app.use("/api/auth", oauthrouter);

// Jobs and snapshots describe public repositories, so they stay public:
// the browser's EventSource cannot send an Authorization header, and
// snapshots must be cacheable by a CDN.
app.use("/api/jobs", jobstatusrouter);
app.use("/api/snapshots", snapshotsrouter);

// Protected routes (require valid JWT)
// Starting an analysis needs an account, which is what the rate limit counts against.
app.use("/api/analyze", requireauth, analyzelimiter, analyzerouter);


try {
 await connectdb();
  app.listen(PORT, () => {
    console.log(`Backend is running on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start:", error.message);
  process.exit(1);
}