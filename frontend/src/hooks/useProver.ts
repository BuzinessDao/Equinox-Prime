"use client";
import { useState, useCallback } from "react";

export interface ProveInput {
  amount: bigint;
  blinding: bigint;
  min: bigint;
  max: bigint;
}

export interface ProveResult {
  proof: Uint8Array;
  commitment: string; // hex, 32 bytes — Pedersen commitment.x
  proofHash: string;  // hex SHA-256 of proof bytes — anchored on-chain
}

/**
 * useProver — client-side Noir WASM prover.
 * All proving happens in the browser. Only commitment + proofHash leave the client.
 * Dynamic imports prevent Next.js from bundling Noir WASM on the server.
 */
export function useProver() {
  const [proving, setProving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prove = useCallback(async (input: ProveInput): Promise<ProveResult | null> => {
    setProving(true);
    setError(null);
    try {
      // Dynamic imports — Noir WASM must not be resolved at build time.
      // These only execute in the browser after hydration.
      const [{ Noir }, { BarretenbergBackend }, circuit] = await Promise.all([
        import("@noir-lang/noir_js"),
        import("@noir-lang/backend_barretenberg"),
        import("../circuits/balance_validator.json"),
      ]);

      const backend = new BarretenbergBackend(circuit as any, { threads: 1 });
      const noir    = new Noir(circuit as any);

      const { witness } = await noir.execute({
        amount:   input.amount.toString(),
        blinding: input.blinding.toString(),
        min:      input.min.toString(),
        max:      input.max.toString(),
      });

      // publicInputs: hex strings in declaration order — commitment (0), min (1), max (2)
      const { proof, publicInputs } = await backend.generateProof(witness);
      const commitment = (publicInputs[0] as string).replace("0x", "").padStart(64, "0");

      const hashBuf   = await crypto.subtle.digest("SHA-256", proof);
      const proofHash = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      return { proof, commitment, proofHash };
    } catch (e: any) {
      setError(e.message ?? "Proof generation failed");
      return null;
    } finally {
      setProving(false);
    }
  }, []);

  return { prove, proving, error };
}
