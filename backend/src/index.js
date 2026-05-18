import "dotenv/config";
import express from "express";
import cors from "cors";
import { vaultRouter } from "./routes/vault.js";
import { indexer } from "./indexer.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/vault", vaultRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Equinox relayer running on :${PORT}`);
  indexer.start();
});
