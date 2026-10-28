import { SorobanRpc } from "@stellar/stellar-sdk";
import { db } from "./db.js";

const RPC_URL     = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.CONTRACT_ID || "";

const rpc = new SorobanRpc.Server(RPC_URL);

export const indexer = {
  startLedger: 0,
  isPolling: false,

  async start() {
    if (!CONTRACT_ID) {
      console.warn("[indexer] CONTRACT_ID not set — idle");
      return;
    }

    try {
      // Resume from stored persistent cursor or start from latest
      const savedCursor = db.getCursor();
      if (savedCursor > 0) {
        this.startLedger = savedCursor;
        console.log(`[indexer] Resuming watch on contract ${CONTRACT_ID} from saved cursor: ledger ${this.startLedger}`);
      } else {
        const { sequence } = await rpc.getLatestLedger();
        this.startLedger = sequence;
        db.saveCursor(sequence);
        console.log(`[indexer] Starting watch on contract ${CONTRACT_ID} from latest ledger: ${sequence}`);
      }

      this.isPolling = true;
      this._poll();
    } catch (err) {
      console.error("[indexer] Startup initialization failed:", err.message);
      setTimeout(() => this.start(), 10000);
    }
  },

  async _poll() {
    if (!this.isPolling) return;

    try {
      const result = await rpc.getEvents({
        startLedger: this.startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [CONTRACT_ID],
            topics: [["*"]],
          },
        ],
        limit: 50,
      });

      if (result && result.events) {
        for (const event of result.events) {
          const topic = event.topic[0]?.value?.toString() ?? "";
          const vaultId = event.topic[1]?.value?.toString("hex") ?? "";

          console.log(`[indexer] Event '${topic}' detected on ledger ${event.ledger} — tx ${event.txHash}`);

          if (topic === "opened" && vaultId) {
            db.updateVaultStatus(vaultId, "Active", {
              txHash: event.txHash,
              openedLedger: event.ledger,
            });
          } else if (topic === "settled" && vaultId) {
            db.updateVaultStatus(vaultId, "Settled", {
              settleHash: event.txHash,
              settledLedger: event.ledger,
            });
          } else if (topic === "refunded" && vaultId) {
            db.updateVaultStatus(vaultId, "Refunded", {
              refundHash: event.txHash,
              refundedLedger: event.ledger,
            });
          } else if (topic === "canceled" && vaultId) {
            db.updateVaultStatus(vaultId, "Refunded", {
              cancelHash: event.txHash,
            });
          } else if (topic === "disputed" && vaultId) {
            db.updateVaultStatus(vaultId, "Disputed", {
              disputeHash: event.txHash,
            });
          }

          if (event.ledger >= this.startLedger) {
            this.startLedger = event.ledger + 1;
            db.saveCursor(this.startLedger);
          }
        }
      }
    } catch (e) {
      console.error("[indexer] poll error:", e.message);
    }

    setTimeout(() => this._poll(), 5000);
  },

  stop() {
    this.isPolling = false;
  }
};
