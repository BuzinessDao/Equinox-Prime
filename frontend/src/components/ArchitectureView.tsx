"use client";
import React from "react";

export default function ArchitectureView() {
  return (
    <div className="space-y-6 text-xs text-gray-300 leading-relaxed">
      <div className="rounded-xl border border-equinox-border bg-equinox-dark p-5">
        <h3 className="text-sm font-bold text-white mb-2">1. Bit-Decomposition Range Proof (Noir ZK)</h3>
        <p className="mb-2">
          Traditional range assertions using arithmetic casts (e.g. <code>as u64</code>) do not constrain field elements within finite field arithmetic. Equinox Prime employs <strong>bit-decomposition proofs</strong>:
        </p>
        <pre className="rounded bg-black/50 p-3 font-mono text-[11px] text-equinox-accent overflow-x-auto">
{`fn assert_n_bits<let N: u32>(value: Field) {
    let bits: [u1; N] = value.to_le_bits();
    let mut recomposed: Field = 0;
    let mut power: Field = 1;
    for i in 0..N {
        recomposed += (bits[i] as Field) * power;
        power *= 2;
    }
    assert(recomposed == value);
}`}
        </pre>
        <p className="mt-2 text-gray-400">
          By proving both <code>(amount - min)</code> and <code>(max - amount)</code> fit in 64 bits without overflow, the buyer proves the price falls strictly within the agreed procurement window without disclosing the true negotiated cost.
        </p>
      </div>

      <div className="rounded-xl border border-equinox-border bg-equinox-dark p-5">
        <h3 className="text-sm font-bold text-white mb-2">2. Pedersen Commitment Binding</h3>
        <p className="mb-2">
          The trade volume is cryptographically bound into a public Pedersen commitment over an elliptic curve:
        </p>
        <div className="rounded bg-black/50 p-3 font-mono text-[11px] text-gray-300">
          C = Pedersen(amount, blinding).x
        </div>
        <p className="mt-2 text-gray-400">
          Due to the discrete logarithm hardness assumption, finding another <code>(amount', blinding')</code> that hashes to <code>C</code> is computationally infeasible. The public ledger receives only <code>C</code>.
        </p>
      </div>

      <div className="rounded-xl border border-equinox-border bg-equinox-dark p-5">
        <h3 className="text-sm font-bold text-white mb-2">3. Timelocked Escrow & Counterparty Safeguards</h3>
        <p className="mb-2">
          Unlike ordinary escrows where counterparty failure traps deposits, Equinox Prime introduces on-chain timelock recovery:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-gray-400">
          <li><strong>Delivery & Settlement:</strong> When parts are delivered, the relayer verifies the Noir proof off-chain and triggers <code>settle()</code>, releasing funds to the supplier.</li>
          <li><strong>Default & Timelock Refund:</strong> If delivery fails past <code>deadline</code>, the buyer triggers <code>refund_vault()</code> directly on Soroban to reclaim 100% of escrowed tokens.</li>
          <li><strong>Mutual Cancellation:</strong> Sellers can cooperatively cancel early via <code>cooperative_cancel()</code> to refund buyers immediately.</li>
        </ul>
      </div>
    </div>
  );
}
