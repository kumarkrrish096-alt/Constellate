import "dotenv/config";
import express from "express"
import cors from "cors";

import jobstatusrouter from "./routes/jobstatus.js"

import { connectdb } from "./db/connect.js";
import healthrouter from "./routes/health.js";
import analyzerouter from "./routes/analyze.js";
import snapshotsrouter from "./routes/snapshots.js";

const app=express();
const PORT=process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());



app.use("/health", healthrouter);
app.use("/api/analyze", analyzerouter);
app.use("/api/jobs", jobstatusrouter);
app.use("/api/snapshots", snapshotsrouter);


try {
 await connectdb();
  app.listen(PORT, () => {
    console.log(`Backend is running on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start:", error.message);
  process.exit(1);
}