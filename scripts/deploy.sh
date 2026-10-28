#!/usr/bin/env bash
# deploy.sh — Build and deploy the Equinox shielded vault to Stellar Testnet
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
ADMIN_SECRET="${ADMIN_SECRET:-}"

if [[ -z "$ADMIN_SECRET" ]]; then
  echo "ERROR: ADMIN_SECRET env var required"
  exit 1
fi

echo "==> Building Soroban contract..."
cd contracts/vault
cargo build --target wasm32-unknown-unknown --release
WASM="target/wasm32-unknown-unknown/release/equinox_vault.wasm"

echo "==> Optimizing WASM..."
stellar contract optimize --wasm "$WASM"
OPT_WASM="${WASM%.wasm}.optimized.wasm"

echo "==> Deploying to $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$OPT_WASM" \
  --source "$ADMIN_SECRET" \
  --network "$NETWORK")

echo "Contract ID: $CONTRACT_ID"

echo "==> Initializing contract..."
ADMIN_PUB=$(stellar keys address "$ADMIN_SECRET" 2>/dev/null || \
  stellar keys public-key --secret-key "$ADMIN_SECRET")

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN_SECRET" \
  --network "$NETWORK" \
  -- init \
  --admin "$ADMIN_PUB"

echo ""
echo "✓ Equinox Prime Shielded Vault deployed & initialized!"
echo "  CONTRACT_ID=$CONTRACT_ID"
echo ""
echo "Add to backend/.env and frontend/.env.local:"
echo "  CONTRACT_ID=$CONTRACT_ID"
echo "  NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID"
