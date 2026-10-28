import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const VAULTS_FILE = path.join(DATA_DIR, "vaults.json");
const CURSOR_FILE = path.join(DATA_DIR, "cursor.json");

function ensureDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export const db = {
  getVaults(): Record<string, any> {
    ensureDirectory();
    if (!fs.existsSync(VAULTS_FILE)) {
      return {};
    }
    try {
      const content = fs.readFileSync(VAULTS_FILE, "utf-8");
      return JSON.parse(content || "{}");
    } catch {
      return {};
    }
  },

  getVault(vaultId: string) {
    const vaults = this.getVaults();
    return vaults[vaultId.toLowerCase()] || null;
  },

  saveVault(vault: any) {
    ensureDirectory();
    const vaults = this.getVaults();
    const id = vault.vaultId.toLowerCase();
    vaults[id] = {
      ...vaults[id],
      ...vault,
      updatedAt: Date.now(),
    };
    fs.writeFileSync(VAULTS_FILE, JSON.stringify(vaults, null, 2), "utf-8");
    return vaults[id];
  },

  getAllVaults(): any[] {
    const vaults = this.getVaults();
    return Object.values(vaults).sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  updateVaultStatus(vaultId: string, status: string, extraData: Record<string, any> = {}) {
    ensureDirectory();
    const vaults = this.getVaults();
    const id = vaultId.toLowerCase();
    if (vaults[id]) {
      vaults[id] = {
        ...vaults[id],
        status,
        ...extraData,
        updatedAt: Date.now(),
      };
      fs.writeFileSync(VAULTS_FILE, JSON.stringify(vaults, null, 2), "utf-8");
      return vaults[id];
    }
    return null;
  },

  getCursor(): number {
    ensureDirectory();
    if (!fs.existsSync(CURSOR_FILE)) {
      return 0;
    }
    try {
      const data = JSON.parse(fs.readFileSync(CURSOR_FILE, "utf-8"));
      return Number(data.lastLedger || 0);
    } catch {
      return 0;
    }
  },

  saveCursor(lastLedger: number) {
    ensureDirectory();
    fs.writeFileSync(CURSOR_FILE, JSON.stringify({ lastLedger, timestamp: Date.now() }, null, 2), "utf-8");
  }
};
