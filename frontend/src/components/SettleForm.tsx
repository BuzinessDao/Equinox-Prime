"use client";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function SettleForm({ vaultId: propVaultId, commitment: propCommitment, proofHash: propProofHash }: {
  vaultId?: string; commitment?: string; proofHash?: string;
}) {
  const [form, setForm] = useState({ vaultId: "", proofHash: "", commitment: "" });
  const [status, setStatus]   = useState<string | null>(null);
  const [txHash, setTxHash]   = useState<string | null>(null);
  const [settling, setSettling] = useState(false);

  // Auto-populate from props (passed by page after open) or localStorage
  useEffect(() => {
    setForm({
      vaultId:    propVaultId    || localStorage.getItem("eq_vaultId")    || "",
      commitment: propCommitment || localStorage.getItem("eq_commitment") || "",
      proofHash:  propProofHash  || localStorage.getItem("eq_proofHash")  || "",
    });
  }, [propVaultId, propCommitment, propProofHash]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSettling(true);
    setStatus("Submitting settlement to Stellar…");

    try {
      const res = await fetch(`${API}/api/vault/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setStatus(`Error: ${data.error}`); return; }

      // Poll for on-chain confirmation
      setStatus("Waiting for Soroban confirmation…");
      let confirmed = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const check = await fetch(`${API}/api/vault/${form.vaultId}`).then((r) => r.json());
        if (check.settled) { confirmed = true; break; }
      }

      setTxHash(data.hash);
      setStatus(confirmed ? "Settlement confirmed on Stellar. Tokens released to seller." : "Transaction submitted — confirmation pending.");
      localStorage.removeItem("eq_vaultId");
      localStorage.removeItem("eq_commitment");
      localStorage.removeItem("eq_proofHash");
    } finally {
      setSettling(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {(["vaultId", "commitment", "proofHash"] as const).map((k) => (
        <div key={k}>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            {k === "vaultId" ? "Vault ID" : k === "proofHash" ? "Proof Hash" : "Commitment"}
          </label>
          <input
            name={k} value={form[k]} onChange={handleChange} required
            className="w-full rounded-md border border-equinox-border bg-equinox-dark px-3 py-2 font-mono text-xs text-white placeholder-gray-600 focus:border-equinox-accent focus:outline-none"
          />
        </div>
      ))}

      <button
        type="submit"
        disabled={settling}
        className="w-full rounded-lg bg-equinox-success px-6 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {settling ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Settling…
          </span>
        ) : "Settle Vault"}
      </button>

      {status && (
        <p className={`text-sm ${status.startsWith("Error") ? "text-red-400" : "text-equinox-success"}`}>
          {status}
        </p>
      )}
      {txHash && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
          target="_blank" rel="noreferrer"
          className="block text-sm text-equinox-accent underline"
        >
          View on Stellar Expert →
        </a>
      )}
    </form>
  );
}
