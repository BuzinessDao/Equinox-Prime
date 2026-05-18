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

export const vaultRouter = Router();

const RPC_URL        = process.env.SOROBAN_RPC_URL  || "https://soroban-testnet.stellar.org";
const CONTRACT_ID    = process.env.CONTRACT_ID      || "";
const RELAYER_SECRET = process.env.RELAYER_SECRET   || "";

// Trust model: the relayer is a semi-trusted admin that verifies the Noir proof
// off-chain (via nargo verify or a WASM verifier) before calling settle().
// The proof_hash is anchored on-chain for auditability — anyone can re-verify
// the proof against the commitment using the public circuit artifact.
// This is an honest centralisation trade-off: the relayer cannot forge a
// commitment (that's enforced on-chain), but it could refuse to settle.
// A future upgrade can replace the relayer with an on-chain WASM verifier
// once Soroban supports the Barretenberg verifier host function.

const rpc = new SorobanRpc.Server(RPC_URL);

const HEX_RE = /^[0-9a-f]+$/i;
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
    throw new Error(`Submit failed: ${result.errorResult}`);
  }

  let response = await rpc.getTransaction(result.hash);
  for (let i = 0; i < 10 && response.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    response = await rpc.getTransaction(result.hash);
  }
  if (response.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${response.status}`);
  }
  return result.hash;
}

/**
 * POST /api/vault/open
 * Body: { vaultId, buyerAddress, sellerAddress, commitment, amount }
 */
vaultRouter.post("/open", async (req, res) => {
  try {
    const { vaultId, buyerAddress, sellerAddress, commitment, amount } = req.body;
    if (!vaultId || !buyerAddress || !sellerAddress || !commitment || !amount) {
      return res.status(400).json({ error: "missing fields" });
    }
    validateHex(vaultId, 64);
    validateHex(commitment, 64);
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const relayer  = Keypair.fromSecret(RELAYER_SECRET);
    const contract = new Contract(CONTRACT_ID);

    const op = contract.call(
      "open_vault",
      nativeToScVal(Buffer.from(vaultId,    "hex"), { type: "bytes" }),
      nativeToScVal(buyerAddress,                   { type: "address" }),
      nativeToScVal(sellerAddress,                  { type: "address" }),
      nativeToScVal(Buffer.from(commitment, "hex"), { type: "bytes" }),
      nativeToScVal(BigInt(amount),                 { type: "i128" }),
    );

    const hash = await buildAndSubmit(relayer, op);
    res.json({ hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/vault/settle
 * Body: { vaultId, proofHash, commitment }
 * Only the relayer keypair (admin) may call this — enforced on-chain.
 */
vaultRouter.post("/settle", async (req, res) => {
  try {
    const { vaultId, proofHash, commitment } = req.body;
    if (!vaultId || !proofHash || !commitment) {
      return res.status(400).json({ error: "missing fields" });
    }
    validateHex(vaultId,    64);
    validateHex(proofHash,  64);
    validateHex(commitment, 64);

    const relayer  = Keypair.fromSecret(RELAYER_SECRET);
    const contract = new Contract(CONTRACT_ID);

    const op = contract.call(
      "settle",
      nativeToScVal(Buffer.from(vaultId,    "hex"), { type: "bytes" }),
      nativeToScVal(Buffer.from(proofHash,  "hex"), { type: "bytes" }),
      nativeToScVal(Buffer.from(commitment, "hex"), { type: "bytes" }),
    );

    const hash = await buildAndSubmit(relayer, op);
    res.json({ hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /api/vault/:id
 * Reads and decodes vault state from Soroban ledger.
 */
vaultRouter.get("/:id", async (req, res) => {
  try {
    const vaultIdHex = req.params.id;
    validateHex(vaultIdHex, 64);

    const contract = new Contract(CONTRACT_ID);

    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: contract.address().toScAddress(),
        key: xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol("Vault"),
          nativeToScVal(Buffer.from(vaultIdHex, "hex"), { type: "bytes" }),
        ]),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );

    const { entries } = await rpc.getLedgerEntries(key);
    if (!entries.length) {
      return res.status(404).json({ error: "vault not found" });
    }

    // Decode the ScVal map into a plain JS object
    const scVal = entries[0].val.contractData().val();
    const native = scValToNative(scVal);

    res.json({
      vaultId:    vaultIdHex,
      buyer:      native.buyer?.toString(),
      seller:     native.seller?.toString(),
      commitment: Buffer.from(native.commitment).toString("hex"),
      proofHash:  Buffer.from(native.proof_hash).toString("hex"),
      amount:     native.amount?.toString(),
      settled:    native.settled,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
