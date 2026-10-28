"use client";
import React, { useEffect, useState } from "react";
import { truncateAddress } from "@/lib/stellar";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function VaultExplorer() {
  const [vaults, setVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  const fetchVaults = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/vault`);
      const data = await res.json();
      if (data && data.vaults) {
        setVaults(data.vaults);
      }
    } catch (err) {
      console.warn("Failed to fetch indexed vaults:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVaults();
  }, []);

  const filteredVaults = vaults.filter((v) => {
    if (filter === "all") return true;
    return v.status?.toLowerCase() === filter.toLowerCase();
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex gap-2">
          {["all", "active", "settled", "refunded"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-md px-3 py-1 text-xs font-medium uppercase transition ${
                filter === tab
                  ? "bg-equinox-accent text-white"
                  : "bg-equinox-dark text-gray-400 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          onClick={fetchVaults}
          disabled={loading}
          className="rounded-md border border-equinox-border bg-equinox-dark px-3 py-1 text-xs text-gray-300 hover:text-white"
        >
          {loading ? "Refreshing…" : "Refresh Feed"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-equinox-border bg-equinox-dark">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-equinox-border bg-equinox-card text-gray-400">
            <tr>
              <th className="p-3">Vault ID</th>
              <th className="p-3">Buyer / Seller</th>
              <th className="p-3">Escrow</th>
              <th className="p-3">Status</th>
              <th className="p-3">Commitment (Public)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-equinox-border/40">
            {filteredVaults.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500 italic">
                  {loading ? "Loading indexed vaults from Soroban..." : "No vaults found matching current filter."}
                </td>
              </tr>
            ) : (
              filteredVaults.map((v) => (
                <tr key={v.vaultId} className="hover:bg-equinox-card/50">
                  <td className="p-3 font-mono font-medium text-white">
                    {truncateAddress(v.vaultId, 6, 6)}
                  </td>
                  <td className="p-3 font-mono text-gray-300">
                    <div>{truncateAddress(v.buyer, 4, 4)}</div>
                    <div className="text-[10px] text-gray-500">→ {truncateAddress(v.seller, 4, 4)}</div>
                  </td>
                  <td className="p-3 font-mono text-white">
                    {v.amount} <span className="text-[10px] text-gray-500">stroops</span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        v.status === "Settled"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : v.status === "Refunded"
                          ? "bg-red-950 text-red-400 border border-red-800"
                          : "bg-blue-950 text-blue-400 border border-blue-800"
                      }`}
                    >
                      {v.status || "Active"}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-gray-400 truncate max-w-[140px]">
                    {v.commitment ? `${v.commitment.slice(0, 14)}...` : "N/A"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
