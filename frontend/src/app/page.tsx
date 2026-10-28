"use client";
import React, { useState } from "react";
import Navbar from "@/components/Navbar";
import VaultForm from "@/components/VaultForm";
import SettleForm from "@/components/SettleForm";
import RefundForm from "@/components/RefundForm";
import VaultExplorer from "@/components/VaultExplorer";
import ArchitectureView from "@/components/ArchitectureView";

export default function Home() {
  const [currentAddress, setCurrentAddress] = useState<string>("GBUYERTESTNETADDRESS72819238471029384710293847102938471");
  const [opened, setOpened] = useState<{ vaultId: string; commitment: string; proofHash: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"open" | "settle" | "refund" | "explorer" | "architecture">("open");

  return (
    <main className="min-h-screen bg-equinox-dark px-4 py-8">
      {/* Top Navbar */}
      <Navbar currentAddress={currentAddress} onAddressChange={setCurrentAddress} />

      {/* Hero Section */}
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-equinox-border bg-equinox-card px-4 py-1 text-xs text-gray-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-equinox-success" />
          Stellar Testnet · Noir Bit-Decomposition ZK · Soroban Timelock Escrow
        </div>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Equinox <span className="text-equinox-accent">Prime</span>
        </h1>
        <p className="mt-3 text-base text-gray-400 max-w-2xl mx-auto">
          Private B2B procurement &amp; supply-chain settlement on Stellar Soroban.
          <br />
          Trade bounds stay cryptographically hidden — only verified ZK commitments touch the public ledger.
        </p>

        {/* Feature Pills */}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {["Hidden-ledger pricing", "Noir ZK Range Proofs", "Pedersen Commitments", "Timelocked Escrow", "Multi-Token SAC (USDC/EURC)"].map((f) => (
            <span key={f} className="rounded-full border border-equinox-border bg-equinox-card px-3 py-1 text-xs text-gray-300">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Main Tab Controls */}
      <section className="mx-auto mt-10 max-w-3xl">
        <div className="flex border-b border-equinox-border gap-1 overflow-x-auto pb-1">
          {[
            { id: "open", label: "Open Shielded Vault" },
            { id: "settle", label: "Verify & Settle" },
            { id: "refund", label: "Timelock Refund" },
            { id: "explorer", label: "Vault Explorer" },
            { id: "architecture", label: "ZK Architecture" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`rounded-t-lg px-4 py-2.5 text-xs font-semibold transition ${
                activeTab === t.id
                  ? "bg-equinox-card text-equinox-accent border-t-2 border-equinox-accent"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content Panes */}
        <div className="rounded-b-2xl border border-equinox-border bg-equinox-card p-6 sm:p-8">
          {activeTab === "open" && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">Open Shielded Escrow Vault</h2>
                <p className="text-xs text-gray-400">
                  Computes a bit-decomposition range proof locally, binds your Pedersen commitment, and locks the escrow deposit on Stellar.
                </p>
              </div>
              <VaultForm onOpened={(vaultId, commitment, proofHash) => {
                setOpened({ vaultId, commitment, proofHash });
                setActiveTab("settle");
              }} />
            </div>
          )}

          {activeTab === "settle" && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">Settle Verified Escrow</h2>
                <p className="text-xs text-gray-400">
                  The off-chain relayer verifies the Noir ZK proof and executes the Soroban smart contract settlement, releasing escrowed tokens to the seller.
                </p>
              </div>
              <SettleForm
                vaultId={opened?.vaultId}
                commitment={opened?.commitment}
                proofHash={opened?.proofHash}
              />
            </div>
          )}

          {activeTab === "refund" && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">Claim Timelocked Refund</h2>
                <p className="text-xs text-gray-400">
                  Inspect active escrow deadlines and safely recover locked tokens if the supplier fails to fulfill the procurement order before the agreed timestamp.
                </p>
              </div>
              <RefundForm />
            </div>
          )}

          {activeTab === "explorer" && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">Live Vault Explorer</h2>
                <p className="text-xs text-gray-400">
                  Audit all active, settled, and refunded vaults indexed from Soroban RPC events.
                </p>
              </div>
              <VaultExplorer />
            </div>
          )}

          {activeTab === "architecture" && (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">Cryptographic Architecture & Security</h2>
                <p className="text-xs text-gray-400">
                  In-depth teardown of bit-decomposition range constraints, elliptic curve Pedersen commitments, and timelock safety guarantees.
                </p>
              </div>
              <ArchitectureView />
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-gray-500 border-t border-equinox-border/40 pt-6">
        <p>Equinox Prime · Confidential B2B Escrow Protocol · Stellar Drips Wave 5 Submission</p>
      </footer>
    </main>
  );
}
