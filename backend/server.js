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

const app=express();
const PORT=process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());



// Public routes (no token needed)
app.use("/health", healthrouter);
app.use("/api/auth", authrouter);
app.use("/api/auth", oauthrouter);

// Protected routes (require valid JWT)
app.use("/api/analyze", requireauth, analyzerouter);
app.use("/api/jobs", requireauth, jobstatusrouter);
app.use("/api/snapshots", requireauth, snapshotsrouter);


try {
 await connectdb();
  app.listen(PORT, () => {
    console.log(`Backend is running on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start:", error.message);
  process.exit(1);
}