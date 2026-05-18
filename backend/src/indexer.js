import { SorobanRpc } from "@stellar/stellar-sdk";

const RPC_URL     = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.CONTRACT_ID || "";

const rpc = new SorobanRpc.Server(RPC_URL);

export const indexer = {
  // Start from current ledger on first run
  startLedger: 0,

  async start() {
    if (!CONTRACT_ID) {
      console.warn("[indexer] CONTRACT_ID not set — idle");
      return;
    }
    const { sequence } = await rpc.getLatestLedger();
    this.startLedger = sequence;
    console.log(`[indexer] watching contract ${CONTRACT_ID} from ledger ${sequence}`);
    this._poll();
  },

  async _poll() {
    try {
      // getEvents is the correct Soroban RPC method for contract events.
      // Horizon transactions().forAccount() does NOT work for C… contract addresses.
      const result = await rpc.getEvents({
        startLedger: this.startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [CONTRACT_ID],
            topics: [["*"]], // match all topics; filter by "settled" below
          },
        ],
        limit: 20,
      });

      for (const event of result.events) {
        const topic = event.topic[0]?.value?.toString() ?? "";
        if (topic === "settled") {
          console.log(`[indexer] settled event — tx ${event.txHash}`);
        }
        // Advance cursor past processed events
        this.startLedger = event.ledger + 1;
      }
    } catch (e) {
      console.error("[indexer] poll error:", e.message);
    }
    setTimeout(() => this._poll(), 5000);
  },
};
