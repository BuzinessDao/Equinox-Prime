"use client";
import React, { useState } from "react";
import { useProver } from "@/hooks/useProver";
import { SUPPORTED_TOKENS, generateDevKeypair } from "@/lib/stellar";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface VaultFormProps {
  onOpened?: (vaultId: string, commitment: string, proofHash: string) => void;
}

export default function VaultForm({ onOpened }: VaultFormProps) {
  const { prove, proving, error: proveError } = useProver();
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [form, setForm] = useState({
    buyer: "",
    seller: "",
    amount: "500000",
    min: "100000",
    max: "2000000",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number>(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleFillDemoKeys = () => {
    const buyer = generateDevKeypair();
    const seller = generateDevKeypair();
    setForm((f) => ({
      ...f,
      buyer: buyer.publicKey,
      seller: seller.publicKey,
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("1/3: Generating Noir bit-decomposition range proof locally…");
    setTxHash(null);
    setActiveStep(1);

    const vaultId = randomHex(32);
    const blinding = BigInt("0x" + randomHex(16));

    // 1. Generate client-side ZK proof
    const result = await prove({
      amount: BigInt(form.amount),
      blinding,
      vaultId,
      min: BigInt(form.min),
      max: BigInt(form.max),
    });

    if (!result) {
      setStatus("Proof generation failed. Amount must fall within specified bounds.");
      setActiveStep(0);
      return;
    }

    setActiveStep(2);
    setStatus("2/3: Bit-decomposition proof verified locally. Locking escrow on Stellar…");

    // Calculate deadline timestamp
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadlineDays * 86400;

    try {
      const res = await fetch(`${API}/api/vault/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId,
          buyerAddress: form.buyer,
          sellerAddress: form.seller,
          tokenAddress: selectedToken.address,
          commitment: result.commitment,
          amount: Number(form.amount),
          deadline: deadlineTimestamp,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus(`Error: ${data.error}`);
        setActiveStep(0);
        return;
      }

      setActiveStep(3);
      setTxHash(data.hash);
      setStatus("3/3: Shielded vault opened! Tokens locked in escrow with timelock protection.");

      // Save vault context
      localStorage.setItem("eq_vaultId", vaultId);
      localStorage.setItem("eq_commitment", result.commitment);
      localStorage.setItem("eq_proofHash", result.proofHash);
      onOpened?.(vaultId, result.commitment, result.proofHash);
    } catch (err: any) {
      setStatus(`Network error: ${err.message}`);
      setActiveStep(0);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Quick fill demo addresses */}
      <div className="flex justify-between items-center text-xs text-gray-400 pb-1">
        <span>Fill in parties and trade bounds</span>
        <button
          type="button"
          onClick={handleFillDemoKeys}
          className="text-equinox-accent hover:underline"
        >
          Generate Demo Testnet Keys
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Buyer Stellar Address"
          name="buyer"
          value={form.buyer}
          onChange={handleChange}
          placeholder="GBUYER..."
        />
        <Field
          label="Seller Stellar Address"
          name="seller"
          value={form.seller}
          onChange={handleChange}
          placeholder="GSELLER..."
        />

        {/* Token Selector */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Escrow Asset</label>
          <select
            value={selectedToken.symbol}
            onChange={(e) => {
              const tok = SUPPORTED_TOKENS.find((t) => t.symbol === e.target.value);
              if (tok) setSelectedToken(tok);
            }}
            className="w-full rounded-md border border-equinox-border bg-equinox-dark px-3 py-2 text-sm text-white focus:border-equinox-accent focus:outline-none"
          >
            {SUPPORTED_TOKENS.map((t) => (
              <option key={t.symbol} value={t.symbol}>
                {t.name} ({t.symbol})
              </option>
            ))}
          </select>
        </div>

        <Field
          label={`Escrow Amount (${selectedToken.symbol} stroops)`}
          name="amount"
          value={form.amount}
          onChange={handleChange}
          placeholder="500000"
          type="number"
        />

        <Field
          label="Private Min Bound"
          name="min"
          value={form.min}
          onChange={handleChange}
          type="number"
        />
        <Field
          label="Private Max Bound"
          name="max"
          value={form.max}
          onChange={handleChange}
          type="number"
        />

        {/* Timelock Duration Selector */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Escrow Timelock Duration (Refund Protection)
          </label>
          <select
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(Number(e.target.value))}
            className="w-full rounded-md border border-equinox-border bg-equinox-dark px-3 py-2 text-sm text-white focus:border-equinox-accent focus:outline-none"
          >
            <option value={1}>1 Day (Express supply)</option>
            <option value={3}>3 Days (Standard delivery)</option>
            <option value={7}>7 Days (Freight procurement)</option>
            <option value={14}>14 Days (Cross-border logistics)</option>
          </select>
          <p className="mt-1 text-[11px] text-gray-500">
            If the seller does not deliver within this window, the buyer can reclaim 100% of escrowed funds.
          </p>
        </div>
      </div>

      {/* Stepper Status */}
      {activeStep > 0 && (
        <div className="rounded-lg border border-equinox-border bg-equinox-dark p-3 text-xs">
          <div className="flex items-center gap-2 mb-1">
            <span className={`h-2 w-2 rounded-full ${activeStep === 3 ? "bg-equinox-success" : "bg-equinox-accent animate-ping"}`} />
            <span className="font-semibold text-white">{status}</span>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={proving}
        className="w-full rounded-lg bg-equinox-accent px-6 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {proving ? "Proving bit-decomposition range…" : "Open Shielded Escrow Vault"}
      </button>

      {proveError && <p className="text-sm text-red-400">{proveError}</p>}

      {txHash && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-equinox-accent underline text-center"
        >
          View Escrow Deposit on Stellar Expert →
        </a>
      )}
    </form>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  placeholder = "",
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-400">{label}</label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        required
        className="w-full rounded-md border border-equinox-border bg-equinox-dark px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-equinox-accent focus:outline-none"
      />
    </div>
  );
}
