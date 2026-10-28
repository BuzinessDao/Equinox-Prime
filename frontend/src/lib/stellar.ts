import { Horizon, Keypair } from "@stellar/stellar-sdk";

export const TESTNET_HORIZON_URL = "https://horizon-testnet.stellar.org";
export const TESTNET_SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
export const DEFAULT_CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "CACTESTCONTRACTEQUINOXPRIME72819347102938471029384";

export interface SupportedToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
}

export const SUPPORTED_TOKENS: SupportedToken[] = [
  {
    symbol: "USDC",
    name: "Stellar Testnet USD Coin",
    address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWUIE3USDC7TESTNET",
    decimals: 7,
  },
  {
    symbol: "EURC",
    name: "Stellar Testnet Euro Coin",
    address: "CB6EURCTESTNETADDRESS72819238471029384710293847102938471",
    decimals: 7,
  },
  {
    symbol: "XLM",
    name: "Native Stellar Lumens",
    address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    decimals: 7,
  },
];

export async function fetchAccountBalance(publicKey: string): Promise<string> {
  if (!publicKey) return "0.00";
  try {
    const server = new Horizon.Server(TESTNET_HORIZON_URL);
    const account = await server.loadAccount(publicKey);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native ? parseFloat(native.balance).toFixed(2) : "0.00";
  } catch {
    return "0.00";
  }
}

export async function requestFriendbot(publicKey: string): Promise<boolean> {
  try {
    const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
    return res.ok;
  } catch {
    return false;
  }
}

export function generateDevKeypair(): { publicKey: string; secretKey: string } {
  const kp = Keypair.random();
  return {
    publicKey: kp.publicKey(),
    secretKey: kp.secret(),
  };
}

export function truncateAddress(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}
