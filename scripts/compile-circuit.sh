#!/usr/bin/env bash
# compile-circuit.sh — Compile Noir circuit and copy artifact to frontend
set -euo pipefail

echo "==> Compiling Noir circuit..."
cd circuits/balance_validator
nargo compile

echo "==> Copying artifact to frontend..."
cp target/balance_validator.json ../../frontend/src/circuits/balance_validator.json

echo "✓ Circuit compiled. Artifact at frontend/src/circuits/balance_validator.json"
