import { Router } from "express";
import {
  Keypair,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  SorobanRpc,
  xdr,
} from "@stellar/stellar-sdk";
import { verifyNoirProof } from "../verifier.js";
import { db } from "../db.js";

export const vaultRouter = Router();

const RPC_URL        = process.env.SOROBAN_RPC_URL  || "https://soroban-testnet.stellar.org";
const CONTRACT_ID    = process.env.CONTRACT_ID      || "";
const RELAYER_SECRET = process.env.RELAYER_SECRET   || "";

const rpc = new SorobanRpc.Server(RPC_URL);

const HEX_RE = /^[0-9a-fA-F]+$/i;
function validateHex(val, len) {
  if (typeof val !== "string" || !HEX_RE.test(val) || val.length !== len) {
    throw new Error(`expected ${len}-char hex string, got: ${String(val).slice(0, 20)}`);
  }
}

async function buildAndSubmit(relayer, operation) {
  const account = await rpc.getAccount(relayer.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  prepared.sign(relayer);

  const result = await rpc.sendTransaction(prepared);
  if (result.status === "ERROR") {
    throw new Error(`Submit failed: ${JSON.stringify(result.errorResult)}`);
  }

  let response = await rpc.getTransaction(result.hash);
  for (let i = 0; i < 12 && response.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    response = await rpc.getTransaction(result.hash);
  }
  if (response.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed with status: ${response.status}`);
  }
  return result.hash;
}

/**
 * POST /api/vault/prepare-open
 * Prepares the Soroban open_vault transaction for the buyer to sign in their browser (via Freighter).
 * Body: { vaultId, buyerAddress, sellerAddress, tokenAddress, commitment, amount, deadline }
 */
vaultRouter.post("/prepare-open", async (req, res) => {
  try {
    const { vaultId, buyerAddress, sellerAddress, tokenAddress, commitment, amount, deadline } = req.body;
    if (!vaultId || !buyerAddress || !sellerAddress || !tokenAddress || !commitment || !amount) {
      return res.status(400).json({ error: "missing required fields" });
    }
    validateHex(vaultId, 64);
    validateHex(commitment, 64);

    const buyerAccount = await rpc.getAccount(buyerAddress);
    const contract = new Contract(CONTRACT_ID);

    const vaultDeadline = deadline ? BigInt(deadline) : BigInt(Math.floor(Date.now() / 1000) + 86400 * 7);

    const op = contract.call(
      "open_vault",
      nativeToScVal(Buffer.from(vaultId, "hex"), { type: "bytes" }),
      nativeToScVal(buyerAddress, { type: "address" }),
      nativeToScVal(sellerAddress, { type: "address" }),
      nativeToScVal(tokenAddress, { type: "address" }),
      nativeToScVal(Buffer.from(commitment, "hex"), { type: "bytes" }),
      nativeToScVal(BigInt(amount), { type: "i128" }),
      nativeToScVal(vaultDeadline, { type: "u64" })
    );

    const tx = new TransactionBuilder(buyerAccount, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(op)
      .setTimeout(60)
      .build();

    const sim = await rpc.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim)) {
      return res.status(400).json({ error: `Simulation failed: ${sim.error}` });
    }

    const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
    res.json({
      xdr: prepared.toXDR(),
      vaultId,
      deadline: vaultDeadline.toString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vault/submit-signed
 * Receives buyer-signed transaction XDR and submits it to Stellar.
 * Body: { signedXdr, vaultDetails }
 */
vaultRouter.post("/submit-signed", async (req, res) => {
  try {
    const { signedXdr, vaultDetails } = req.body;
    if (!signedXdr) {
      return res.status(400).json({ error: "missing signedXdr" });
    }

    const tx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    const result = await rpc.sendTransaction(tx);

    if (result.status === "ERROR") {
      return res.status(400).json({ error: `Submit failed: ${JSON.stringify(result.errorResult)}` });
    }

    let response = await rpc.getTransaction(result.hash);
    for (let i = 0; i < 12 && response.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      response = await rpc.getTransaction(result.hash);
    }

    if (response.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return res.status(500).json({ error: `Transaction rejected: ${response.status}` });
    }

    if (vaultDetails && vaultDetails.vaultId) {
      db.saveVault({
        ...vaultDetails,
        txHash: result.hash,
        status: "Active",
      });
    }

    res.json({ hash: result.hash, status: "SUCCESS" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vault/open
 * Legacy/Relayer-signed direct invocation
 */
vaultRouter.post("/open", async (req, res) => {
  try {
    const { vaultId, buyerAddress, sellerAddress, tokenAddress, commitment, amount, deadline } = req.body;
    if (!vaultId || !buyerAddress || !sellerAddress || !commitment || !amount) {
      return res.status(400).json({ error: "missing fields" });
    }
    validateHex(vaultId, 64);
    validateHex(commitment, 64);

    const relayer = Keypair.fromSecret(RELAYER_SECRET);
    const contract = new Contract(CONTRACT_ID);
    const token = tokenAddress || buyerAddress; // fallback if single token
    const vaultDeadline = deadline ? BigInt(deadline) : BigInt(Math.floor(Date.now() / 1000) + 86400 * 7);

    const op = contract.call(
      "open_vault",
      nativeToScVal(Buffer.from(vaultId, "hex"), { type: "bytes" }),
      nativeToScVal(buyerAddress, { type: "address" }),
      nativeToScVal(sellerAddress, { type: "address" }),
      nativeToScVal(token, { type: "address" }),
      nativeToScVal(Buffer.from(commitment, "hex"), { type: "bytes" }),
      nativeToScVal(BigInt(amount), { type: "i128" }),
      nativeToScVal(vaultDeadline, { type: "u64" })
    );

    const hash = await buildAndSubmit(relayer, op);

    db.saveVault({
      vaultId,
      buyer: buyerAddress,
      seller: sellerAddress,
      token,
      commitment,
      amount,
      deadline: vaultDeadline.toString(),
      txHash: hash,
      status: "Active",
    });

    res.json({ hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vault/settle
 * Verifies the Noir ZK proof and submits the on-chain settlement invocation.
 * Body: { vaultId, proof, proofHash, commitment, publicInputs }
 */
vaultRouter.post("/settle", async (req, res) => {
  try {
    const { vaultId, proof, proofHash, commitment, publicInputs } = req.body;
    if (!vaultId || !commitment || (!proof && !proofHash)) {
      return res.status(400).json({ error: "missing required fields (vaultId, commitment, proof/proofHash)" });
    }
    validateHex(vaultId, 64);
    validateHex(commitment, 64);

    // 1. Off-chain ZK verification
    const verification = await verifyNoirProof({
      vaultId,
      commitment,
      proof,
      proofHash,
      publicInputs,
    });

    if (!verification.valid) {
      return res.status(400).json({
        error: `Noir ZK proof verification failed: ${verification.error}`
      });
    }

    const verifiedProofHash = verification.proofHash;
    const relayer = Keypair.fromSecret(RELAYER_SECRET);
    const contract = new Contract(CONTRACT_ID);

    const op = contract.call(
      "settle",
      nativeToScVal(Buffer.from(vaultId, "hex"), { type: "bytes" }),
      nativeToScVal(Buffer.from(verifiedProofHash, "hex"), { type: "bytes" }),
      nativeToScVal(Buffer.from(commitment, "hex"), { type: "bytes" })
    );

    const hash = await buildAndSubmit(relayer, op);

    db.updateVaultStatus(vaultId, "Settled", {
      settleHash: hash,
      proofHash: verifiedProofHash,
    });

    res.json({ hash, settled: true, proofHash: verifiedProofHash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vault/refund
 * Processes timelocked refund if the deadline has elapsed without delivery.
 * Body: { vaultId }
 */
vaultRouter.post("/refund", async (req, res) => {
  try {
    const { vaultId } = req.body;
    if (!vaultId) {
      return res.status(400).json({ error: "missing vaultId" });
    }
    validateHex(vaultId, 64);

    const relayer = Keypair.fromSecret(RELAYER_SECRET);
    const contract = new Contract(CONTRACT_ID);

    const op = contract.call(
      "refund_vault",
      nativeToScVal(Buffer.from(vaultId, "hex"), { type: "bytes" })
    );

    const hash = await buildAndSubmit(relayer, op);
    db.updateVaultStatus(vaultId, "Refunded", { refundHash: hash });

    res.json({ hash, refunded: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vault
 * Returns all indexed vaults from the persistent store.
 */
vaultRouter.get("/", (_req, res) => {
  try {
    const vaults = db.getAllVaults();
    res.json({ vaults });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vault/:id
 * Reads and decodes vault state from Soroban ledger and local database.
 */
vaultRouter.get("/:id", async (req, res) => {
  try {
    const vaultIdHex = req.params.id;
    validateHex(vaultIdHex, 64);

    const cached = db.getVault(vaultIdHex);
    const contract = new Contract(CONTRACT_ID);

    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: contract.address().toScAddress(),
        key: xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol("Vault"),
          nativeToScVal(Buffer.from(vaultIdHex, "hex"), { type: "bytes" }),
        ]),
        durability: xdr.ContractDataDurability.persistent(),
      })
    );

    const { entries } = await rpc.getLedgerEntries(key);
    if (!entries.length) {
      if (cached) return res.json(cached);
      return res.status(404).json({ error: "vault not found" });
    }

    const scVal = entries[0].val.contractData().val();
    const native = scValToNative(scVal);

    const onChainData = {
      vaultId:    vaultIdHex,
      buyer:      native.buyer?.toString(),
      seller:     native.seller?.toString(),
      token:      native.token?.toString(),
      commitment: Buffer.from(native.commitment).toString("hex"),
      proofHash:  Buffer.from(native.proof_hash).toString("hex"),
      amount:     native.amount?.toString(),
      deadline:   native.deadline?.toString(),
      depositTime: native.deposit_time?.toString(),
      status:     typeof native.status === "object" ? Object.keys(native.status)[0] : native.status,
    };

    db.saveVault(onChainData);
    res.json(onChainData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
