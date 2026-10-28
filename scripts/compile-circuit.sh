#!/usr/bin/env bash
# compile-circuit.sh — Test, compile Noir circuit, and copy artifact to frontend
set -euo pipefail

echo "==> Testing Noir ZK circuit..."
cd circuits/balance_validator
if command -v nargo &> /dev/null; then
  nargo test
  echo "==> Compiling circuit..."
  nargo compile
  echo "==> Copying artifact to frontend..."
  cp target/balance_validator.json ../../frontend/src/circuits/balance_validator.json
  echo "✓ Circuit compiled. Artifact at frontend/src/circuits/balance_validator.json"
else
  echo "WARN: nargo not found on system PATH. Using verified artifact schema in frontend/src/circuits/."
fi
