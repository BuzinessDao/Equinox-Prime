# Equinox Prime

**Private B2B Escrow & Supply-Chain Settlement on Stellar**

> Stellar Drips Wave 5 Submission

---

## The Problem

High-value B2B procurement is broken. When a manufacturer finalizes a $2M parts order on a public ledger, every competitor can see the pricing structure, supplier relationships, and inventory volumes. This leakage destroys negotiating leverage and exposes trade secrets.

## The Solution

Equinox Prime is a **hidden-ledger procurement system** that lets commercial entities settle high-value trade transactions on Stellar without leaking pricing or volume to watching parties.

**Only cryptographic commitments ever touch the public ledger. Raw amounts never leave the buyer's browser.**

---

## Core Innovation: Client-Side Noir ZK Proving + Soroban

Equinox Prime combines two technologies:

1. **Noir ZK circuit** (compiled to WASM, runs in-browser): The buyer enters the trade amount locally. The circuit generates a Pedersen commitment and a **bit-decomposition range proof** — proving `amount ∈ [min, max]` without revealing the amount. All proving is client-side; the raw amount never leaves the browser.

2. **Soroban shielded vault contract** (Rust): Stores only the commitment and proof hash on-chain. The relayer (who has verified the proof) calls `settle()` — enforced by on-chain admin auth. Typed contract errors (`#[contracterror]`) give clean failure modes.

Competitors watching the ledger see: `commitment = 0x3f8a…` — nothing more.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (Client)                   │
│                                                      │
│  Next.js Portal                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  Noir WASM Prover (client-side)              │   │
│  │  • Pedersen commitment of trade amount       │   │
│  │  • Bit-decomposition range proof             │   │
│  │    (amount - min) fits in 64 bits            │   │
│  │    (max - amount) fits in 64 bits            │   │
│  │  • Amount NEVER leaves this box              │   │
│  └──────────────────────────────────────────────┘   │
│         │ commitment + proof_hash only               │
└─────────┼───────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│  Node.js Relayer    │  ← indexes Soroban events via RPC getEvents
│  (Express + SDK)    │  ← submits txs via SorobanRpc.sendTransaction
└─────────┬───────────┘
          │ Soroban RPC invoke
          ▼
┌─────────────────────────────────────────────────────┐
│              Stellar Testnet (Soroban)               │
│                                                      │
│  ShieldedVault Contract (Rust)                       │
│  • open_vault(commitment)  — no amount stored        │
│  • settle(proof_hash, commitment_check) — admin only │
│  • Typed errors via #[contracterror]                 │
│  • Emits "settled" event with buyer/seller only      │
└─────────────────────────────────────────────────────┘
```

---

## Project Structure

```
equinox-prime/
├── circuits/
│   └── balance_validator/       # Noir ZK circuit
│       ├── Nargo.toml
│       └── src/main.nr          # Pedersen commitment + bit-decomposition range proof
│
├── contracts/
│   └── vault/                   # Soroban smart contract (Rust)
│       ├── Cargo.toml
│       └── src/lib.rs           # ShieldedVault — typed errors, admin auth
│
├── backend/                     # Node.js indexing relayer
│   ├── package.json
│   └── src/
│       ├── index.js             # Express server
│       ├── indexer.js           # Soroban RPC event indexer (getEvents)
│       └── routes/vault.js      # open + settle + get endpoints
│
├── frontend/                    # Next.js portal
│   ├── next.config.mjs          # WASM enabled
│   └── src/
│       ├── app/page.tsx         # Landing page
│       ├── hooks/useProver.ts   # Noir WASM prover hook
│       └── components/
│           ├── VaultForm.tsx    # Open vault UI
│           └── SettleForm.tsx   # Settle vault UI
│
└── scripts/
    ├── deploy.sh                # Deploy contract to Stellar
    └── compile-circuit.sh       # Compile Noir → WASM artifact
```

---

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) + `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)
- [Nargo](https://noir-lang.org/docs/getting_started/installation/) ≥ 0.31
- Node.js ≥ 20

### 1. Compile the ZK Circuit

```bash
./scripts/compile-circuit.sh
```

Places `balance_validator.json` in `frontend/src/circuits/`.

### 2. Deploy the Contract

```bash
export ADMIN_SECRET=S…your-testnet-secret…
./scripts/deploy.sh
# Outputs: CONTRACT_ID=C…
```

### 3. Configure Environment

```bash
cp backend/.env.example backend/.env        # fill CONTRACT_ID + RELAYER_SECRET
cp frontend/.env.local.example frontend/.env.local
```

### 4. Run

```bash
npm install
npm run dev
```

Frontend: http://localhost:3000  
Backend: http://localhost:3001

---

## ZK Circuit: `balance_validator`

```
Private inputs:
  amount    — actual trade value in stroops
  blinding  — random blinding factor

Public inputs:
  commitment — Pedersen(amount, blinding).x
  min        — agreed lower bound
  max        — agreed upper bound

Constraints:
  1. computed_commitment == commitment
  2. (amount - min) fits in 64 bits  ← bit-decomposition range proof
  3. (max - amount) fits in 64 bits  ← bit-decomposition range proof
```

The range proof uses **bit decomposition** (`Field.to_le_bits(64)`), not arithmetic casts. This is the correct ZK primitive — a truncating `as u64` cast does not constrain the field element and can be bypassed.

---

## Smart Contract: `ShieldedVault`

| Function | Auth | Returns | Description |
|---|---|---|---|
| `init(admin)` | admin | `Result<(), VaultError>` | One-time initialization |
| `open_vault(id, buyer, seller, commitment)` | buyer | `Result<(), VaultError>` | Opens escrow with commitment |
| `settle(id, proof_hash, commitment_check)` | admin only | `Result<(), VaultError>` | Finalizes; admin has verified proof |
| `get_vault(id)` | public | `Result<VaultState, VaultError>` | Returns commitment + settled flag |

Errors are typed via `#[contracterror]`: `NotFound`, `AlreadySettled`, `CommitmentMismatch`, `Unauthorized`, `AlreadyExists`.

The contract **never stores a raw amount**.

---

## Why This Stands Out for Stellar Drips Wave 5

| Criterion | Equinox Prime |
|---|---|
| **Soroban contracts** | Rust shielded vault with typed errors, admin auth, persistent storage |
| **Real use case** | B2B procurement is a $50T+ market with genuine privacy needs |
| **Novel privacy model** | Pedersen commitments + Noir bit-decomposition range proofs on Stellar |
| **Correct ZK** | Range proof uses `to_le_bits` decomposition, not unsafe casts |
| **Correct Stellar SDK usage** | SorobanRpc for tx submission, simulation, and `getEvents` for indexing |
| **Full stack** | Circuit + Contract + Relayer + Frontend all in one repo |

---

## License

MIT
