import express from "express"
import "dotenv/config";
import cors from "cors";

import { connectdb } from "./db/connect.js";
import healthrouter from "./routes/health.js";
import analyzerouter from "./routes/analyze.js";
import { createindexes } from "./db/indexes.js";


const app=express();
const PORT=process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());



app.get("/health", healthrouter);
app.use("/api/analyze", analyzerouter);



try {
  await connectdb();
  await createindexes();
  app.listen(PORT, () => {
    console.log(`Backend is running on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start:", error.message);
  process.exit(1);
}