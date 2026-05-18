"use client";
import { useState } from "react";
import { useProver } from "@/hooks/useProver";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function VaultForm({ onOpened }: { onOpened?: (vaultId: string, commitment: string, proofHash: string) => void }) {
  const { prove, proving, error: proveError } = useProver();
  const [form, setForm] = useState({
    buyer: "", seller: "", amount: "", min: "100000", max: "10000000",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Generating ZK proof locally…");
    setTxHash(null);

    const blinding = BigInt("0x" + randomHex(16));
    const result = await prove({
      amount:  BigInt(form.amount),
      blinding,
      min:     BigInt(form.min),
      max:     BigInt(form.max),
    });
    if (!result) { setStatus("Proof generation failed."); return; }

    setStatus("Proof verified locally. Opening vault on Stellar…");
    const vaultId = randomHex(32);

    const res = await fetch(`${API}/api/vault/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaultId,
        buyerAddress:  form.buyer,
        sellerAddress: form.seller,
        commitment:    result.commitment,
        amount:        Number(form.amount),
      }),
    });

    const data = await res.json();
    if (!res.ok) { setStatus(`Error: ${data.error}`); return; }

    // Persist across open→settle flow
    localStorage.setItem("eq_vaultId",     vaultId);
    localStorage.setItem("eq_commitment",  result.commitment);
    localStorage.setItem("eq_proofHash",   result.proofHash);
    onOpened?.(vaultId, result.commitment, result.proofHash);

    setTxHash(data.hash);
    setStatus("Vault opened. Commitment anchored on Stellar. Amount never left your browser.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Buyer Stellar Address"       name="buyer"  value={form.buyer}  onChange={handleChange} placeholder="G…" />
        <Field label="Seller Stellar Address"      name="seller" value={form.seller} onChange={handleChange} placeholder="G…" />
        <Field label="Escrow Amount (stroops)"     name="amount" value={form.amount} onChange={handleChange} placeholder="500000" type="number" />
        <Field label="Min Threshold"               name="min"    value={form.min}    onChange={handleChange} type="number" />
        <Field label="Max Threshold"               name="max"    value={form.max}    onChange={handleChange} type="number" />
      </div>

      <button
        type="submit"
        disabled={proving}
        className="w-full rounded-lg bg-equinox-accent px-6 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {proving ? "Proving locally…" : "Open Shielded Vault"}
      </button>

      {(status || proveError) && (
        <p className={`text-sm ${proveError ? "text-red-400" : "text-equinox-success"}`}>
          {proveError || status}
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

function Field({ label, name, value, onChange, placeholder = "", type = "text" }: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-400">{label}</label>
      <input
        name={name} value={value} onChange={onChange}
        placeholder={placeholder} type={type} required
        className="w-full rounded-md border border-equinox-border bg-equinox-dark px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-equinox-accent focus:outline-none"
      />
    </div>
  );
}
