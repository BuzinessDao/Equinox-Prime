"use client";
import React, { useState, useEffect } from "react";
import { fetchAccountBalance, requestFriendbot, truncateAddress, generateDevKeypair } from "@/lib/stellar";

interface NavbarProps {
  currentAddress: string;
  onAddressChange: (addr: string) => void;
}

export default function Navbar({ currentAddress, onAddressChange }: NavbarProps) {
  const [balance, setBalance] = useState("0.00");
  const [funding, setFunding] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  const refreshBalance = async (addr: string) => {
    if (!addr) return;
    const b = await fetchAccountBalance(addr);
    setBalance(b);
  };

  useEffect(() => {
    if (currentAddress) {
      refreshBalance(currentAddress);
    }
  }, [currentAddress]);

  const handleFund = async () => {
    if (!currentAddress) return;
    setFunding(true);
    setFaucetMsg(null);
    const ok = await requestFriendbot(currentAddress);
    if (ok) {
      setFaucetMsg("Funded +10,000 test XLM!");
      setTimeout(() => refreshBalance(currentAddress), 1500);
    } else {
      setFaucetMsg("Friendbot busy. Try again.");
    }
    setFunding(false);
  };

  const handleGenKey = () => {
    const kp = generateDevKeypair();
    onAddressChange(kp.publicKey);
  };

  return (
    <header className="mx-auto max-w-4xl border-b border-equinox-border/60 pb-6 mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 shadow-lg shadow-amber-500/20 font-bold text-black text-lg">
          EP
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-white tracking-wide">Equinox Prime</span>
            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400 uppercase">
              Soroban Protocol 22
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Stellar Testnet Confidential Escrow</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {currentAddress ? (
          <div className="flex items-center gap-2 rounded-lg border border-equinox-border bg-equinox-card px-3 py-1.5 text-xs text-gray-300 font-mono">
            <span>{truncateAddress(currentAddress, 4, 4)}</span>
            <span className="text-amber-400 font-bold">({balance} XLM)</span>
            <button
              onClick={handleFund}
              disabled={funding}
              className="ml-2 text-xs text-cyan-400 hover:underline disabled:opacity-50"
              title="Request 10,000 XLM from Friendbot"
            >
              {funding ? "Funding…" : "+Faucet"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenKey}
            className="rounded-lg bg-equinox-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Connect Dev Account
          </button>
        )}
      </div>

      {faucetMsg && (
        <div className="w-full text-right text-xs text-emerald-400 font-medium">
          {faucetMsg}
        </div>
      )}
    </header>
  );
}
