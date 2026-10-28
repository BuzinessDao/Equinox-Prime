import "dotenv/config";
import express from "express";
import cors from "cors";
import { vaultRouter } from "./routes/vault.js";
import { indexer } from "./indexer.js";

const app = express();

// Security and CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: "5mb" }));

// In-memory rate limiting middleware
const requestCounts = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 120;

app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "global";
  const now = Date.now();
  const record = requestCounts.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + RATE_LIMIT_WINDOW_MS;
  } else {
    record.count += 1;
  }
  requestCounts.set(ip, record);

  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "Too many requests, please slow down." });
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

// Mount Routes
app.use("/api/vault", vaultRouter);

app.get("/health", (_req, res) => res.json({
  status: "ok",
  service: "equinox-prime-relayer",
  network: "stellar-testnet",
  uptimeSeconds: Math.floor(process.uptime()),
}));

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Equinox relayer running on :${PORT}`);
  indexer.start();
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down relayer gracefully...");
  indexer.stop();
  server.close(() => process.exit(0));
});
