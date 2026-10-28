"use client";
import React, { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function RefundForm() {
  const [vaultId, setVaultId] = useState("");
  const [vaultInfo, setVaultInfo] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleInspect() {
    if (!vaultId.trim()) return;
    setChecking(true);
    setStatus(null);
    try {
      const res = await fetch(`${API}/api/vault/${vaultId.trim()}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Error: ${data.error}`);
        setVaultInfo(null);
      } else {
        setVaultInfo(data);
      }
    } catch (err: any) {
      setStatus(`Network error: ${err.message}`);
    } finally {
      setChecking(false);
    }
  }

  async function handleRefund() {
    if (!vaultId.trim()) return;
    setRefunding(true);
    setStatus("Submitting timelocked refund request to Stellar…");
    try {
      const res = await fetch(`${API}/api/vault/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId: vaultId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`Refund rejected: ${data.error}`);
      } else {
        setTxHash(data.hash);
        setStatus("✓ Escrowed tokens refunded successfully to the buyer!");
        handleInspect();
      }
    } catch (err: any) {
      setStatus(`Network error: ${err.message}`);
    } finally {
      setRefunding(false);
    }
  }

  const isExpired = vaultInfo?.deadline
    ? Date.now() / 1000 >= Number(vaultInfo.deadline)
    : false;

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-400">
          Vault ID to Inspect / Reclaim
        </label>
        <div className="flex gap-2">
          <input
            value={vaultId}
            onChange={(e) => setVaultId(e.target.value)}
            placeholder="Enter 64-character Vault ID..."
            className="w-full rounded-md border border-equinox-border bg-equinox-dark px-3 py-2 font-mono text-xs text-white placeholder-gray-600 focus:border-equinox-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={handleInspect}
            disabled={checking || !vaultId}
            className="rounded-md bg-equinox-card border border-equinox-border px-4 py-2 text-xs font-semibold text-white hover:bg-equinox-border disabled:opacity-50"
          >
            {checking ? "Checking…" : "Inspect"}
          </button>
        </div>
      </div>

      {vaultInfo && (
        <div className="rounded-lg border border-equinox-border bg-equinox-dark p-4 space-y-2 text-xs">
          <div className="flex justify-between border-b border-equinox-border pb-2">
            <span className="text-gray-400">Current Status:</span>
            <span className="font-semibold text-equinox-accent uppercase">{vaultInfo.status || "Active"}</span>
          </div>
          <div className="flex justify-between border-b border-equinox-border pb-2">
            <span className="text-gray-400">Escrow Amount:</span>
            <span className="font-mono text-white">{vaultInfo.amount || "N/A"} stroops</span>
          </div>
          <div className="flex justify-between border-b border-equinox-border pb-2">
            <span className="text-gray-400">Buyer Address:</span>
            <span className="font-mono text-gray-300 truncate max-w-[200px]">{vaultInfo.buyer}</span>
          </div>
          <div className="flex justify-between border-b border-equinox-border pb-2">
            <span className="text-gray-400">Timelock Deadline:</span>
            <span className="font-mono text-white">
              {vaultInfo.deadline ? new Date(Number(vaultInfo.deadline) * 1000).toLocaleString() : "N/A"}
            </span>
          </div>
          <div className="flex justify-between pt-1">
            <span className="text-gray-400">Timelock State:</span>
            <span className={isExpired ? "text-equinox-success font-semibold" : "text-yellow-400"}>
              {isExpired ? "Deadline Elapsed (Refundable)" : "Locked (Under Trade Delivery Window)"}
            </span>
          </div>

          <div className="pt-3">
            <button
              type="button"
              onClick={handleRefund}
              disabled={refunding || vaultInfo.status === "Settled" || vaultInfo.status === "Refunded"}
              className="w-full rounded-md bg-red-600/80 hover:bg-red-600 px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-40"
            >
              {refunding ? "Processing Refund…" : "Claim Escrow Refund"}
            </button>
            {!isExpired && (
              <p className="mt-1 text-[11px] text-gray-500 text-center">
                Note: Refunds require deadline to have passed unless mutually canceled by supplier.
              </p>
            )}
          </div>
        </div>
      )}

      {status && (
        <p className={`text-sm ${status.includes("rejected") || status.includes("Error") ? "text-red-400" : "text-equinox-success"}`}>
          {status}
        </p>
      )}

      {txHash && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-equinox-accent underline text-center"
        >
          View Refund on Stellar Expert →
        </a>
      )}
    </div>
  );
}
