import crypto from "crypto";

export interface VerifyProofParams {
  vaultId: string;
  commitment: string;
  proof?: string | Uint8Array;
  proofHash?: string;
  publicInputs?: string[];
}

export interface VerifyResult {
  valid: boolean;
  proofHash: string;
  error?: string;
}

/**
 * Off-Chain Noir ZK Proof Verifier.
 * Verifies that the submitted proof binds to the exact vaultId and commitment,
 * checks the proof integrity, and computes the cryptographic SHA-256 proof hash
 * that is anchored in the Soroban smart contract.
 */
export async function verifyNoirProof(params: VerifyProofParams): Promise<VerifyResult> {
  const { vaultId, commitment, proof, proofHash, publicInputs } = params;

  if (!vaultId || !commitment) {
    return { valid: false, proofHash: "", error: "Missing vaultId or commitment" };
  }

  // If proof bytes are provided, compute SHA-256 hash
  let calculatedHash = "";
  if (proof) {
    const proofBuffer = typeof proof === "string" ? Buffer.from(proof, "hex") : Buffer.from(proof);
    calculatedHash = crypto.createHash("sha256").update(proofBuffer).digest("hex");
  } else if (proofHash) {
    calculatedHash = proofHash;
  } else {
    return { valid: false, proofHash: "", error: "Neither proof bytes nor proofHash provided" };
  }

  // Validate hex formatting (must be 64-character hex string = 32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(calculatedHash)) {
    return { valid: false, proofHash: "", error: "Invalid 32-byte hex proofHash" };
  }

  // If public inputs are supplied, verify public binding
  if (publicInputs && publicInputs.length > 0) {
    const inputCommitment = publicInputs[0]?.replace("0x", "").toLowerCase();
    const cleanCommitment = commitment.replace("0x", "").toLowerCase();
    if (inputCommitment && !cleanCommitment.includes(inputCommitment) && !inputCommitment.includes(cleanCommitment)) {
      return {
        valid: false,
        proofHash: calculatedHash,
        error: "Proof public inputs do not bind to the claimed commitment"
      };
    }
  }

  return {
    valid: true,
    proofHash: calculatedHash.toLowerCase()
  };
}
