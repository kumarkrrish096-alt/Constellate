import "dotenv/config";
import express from "express"
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import jobstatusrouter from "./routes/jobstatus.js"

import { connectdb } from "./db/connect.js";
import healthrouter from "./routes/health.js";
import analyzerouter from "./routes/analyze.js";
import snapshotsrouter from "./routes/snapshots.js";
import authrouter from "./routes/auth.js";
import oauthrouter from "./routes/oauth.js";
import { requireauth } from "./middleware/auth.js";
import { assertAuthConfig, FRONTEND_URL } from "./config/auth.js";

assertAuthConfig();

const app=express();
const PORT=process.env.PORT || 5000;

// Behind a load balancer / PaaS proxy, set TRUST_PROXY=1 so req.ip (used by
// rate limiting) is the client's address rather than the proxy's.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.disable("x-powered-by");
app.use(helmet());
// credentials: true lets the browser send the httpOnly refresh cookie.
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());



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