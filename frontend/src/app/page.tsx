"use client";
import { useState } from "react";
import VaultForm from "@/components/VaultForm";
import SettleForm from "@/components/SettleForm";

export default function Home() {
  // State flows from VaultForm → SettleForm so the user never has to copy-paste
  const [opened, setOpened] = useState<{ vaultId: string; commitment: string; proofHash: string } | null>(null);

  return (
    <main className="min-h-screen bg-equinox-dark px-4 py-12">
      {/* Hero */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-equinox-border bg-equinox-card px-4 py-1 text-xs text-gray-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-equinox-success" />
          Stellar Testnet · Noir ZK · Soroban
        </div>
        <h1 className="mt-4 text-5xl font-bold tracking-tight text-white">
          Equinox <span className="text-equinox-accent">Prime</span>
        </h1>
        <p className="mt-4 text-lg text-gray-400">
          Private B2B escrow &amp; supply-chain settlement on Stellar.
          <br />
          Trade amounts stay in your browser — only ZK commitments touch the ledger.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["Hidden-ledger pricing", "Noir ZK proofs (WASM)", "Pedersen commitments", "Soroban smart contracts", "SAC token escrow"].map((f) => (
            <span key={f} className="rounded-full border border-equinox-border bg-equinox-card px-3 py-1 text-xs text-gray-300">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="mb-6 text-center text-xl font-semibold text-white">How It Works</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              step: "01", title: "Commit",
              body: "Buyer enters trade amount locally. A Pedersen commitment + bit-decomposition range proof is generated in-browser via Noir WASM. The raw amount never leaves the client.",
            },
            {
              step: "02", title: "Deposit",
              body: "The commitment is anchored on Stellar. Buyer's tokens are locked in the Soroban vault contract via SAC transfer. No amount is stored — only the commitment.",
            },
            {
              step: "03", title: "Settle",
              body: "The relayer verifies the Noir proof and calls settle(). The contract checks the commitment and releases tokens to the seller. Competitors see nothing.",
            },
          ].map(({ step, title, body }) => (
            <div key={step} className="rounded-xl border border-equinox-border bg-equinox-card p-5">
              <div className="mb-2 text-xs font-bold text-equinox-accent">{step}</div>
              <h3 className="mb-2 font-semibold text-white">{title}</h3>
              <p className="text-sm text-gray-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Open Vault */}
      <section className="mx-auto mt-12 max-w-2xl rounded-2xl border border-equinox-border bg-equinox-card p-8">
        <h2 className="mb-1 text-lg font-semibold text-white">Open Shielded Vault</h2>
        <p className="mb-6 text-xs text-gray-500">Vault ID and commitment are auto-filled below after opening.</p>
        <VaultForm onOpened={(vaultId, commitment, proofHash) => setOpened({ vaultId, commitment, proofHash })} />
      </section>

      {/* Settle Vault */}
      <section className="mx-auto mt-8 max-w-2xl rounded-2xl border border-equinox-border bg-equinox-card p-8">
        <h2 className="mb-1 text-lg font-semibold text-white">Settle Vault</h2>
        <p className="mb-6 text-xs text-gray-500">Fields are pre-filled from the vault you just opened, or paste manually.</p>
        <SettleForm
          vaultId={opened?.vaultId}
          commitment={opened?.commitment}
          proofHash={opened?.proofHash}
        />
      </section>

      <footer className="mt-16 text-center text-xs text-gray-600">
        Equinox Prime · Stellar Drips Wave 5 · Soroban + Noir ZK
      </footer>
    </main>
  );
}
