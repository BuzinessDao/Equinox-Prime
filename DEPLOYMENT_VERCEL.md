# Equinox Prime — Vercel Deployment Guide

This guide details how to deploy the **Equinox Prime** confidential B2B procurement portal to **Vercel** with continuous deployment from GitHub.

---

## 1. Quick Deploy via Vercel Web Dashboard (Recommended)

1. Navigate to [vercel.com/new](https://vercel.com/new).
2. Connect your GitHub account and import the repository:
   **`https://github.com/BuzinessDao/Equinox-Prime`**
3. Configure project settings:
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
   - **Install Command**: `npm install`

---

## 2. Environment Variables

Configure the following environment variables in Vercel **Settings > Environment Variables**:

| Variable Name | Description | Recommended Value |
|---|---|---|
| `NEXT_PUBLIC_STELLAR_NETWORK` | Stellar network target | `TESTNET` |
| `NEXT_PUBLIC_API_URL` | Relayer backend URL | `https://api.equinox-prime.stellar.network` or `http://localhost:3001` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Soroban JSON-RPC node | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_HORIZON_URL` | Stellar Horizon REST API | `https://horizon-testnet.stellar.org` |
| `NEXT_PUBLIC_CONTRACT_ID` | ShieldedVault Soroban Contract | Your deployed contract ID (e.g. `C...`) |

---

## 3. Deploy via Vercel CLI

Ensure you have the Vercel CLI installed:

```bash
npm install -g vercel
vercel login
cd frontend
vercel --prod
```

---

## 4. Verification Checklist

Once deployed to your `*.vercel.app` domain:
1. Verify the green **Stellar Testnet** indicator in the navbar.
2. Click **Connect Dev Account** or fill in testnet addresses.
3. Test **Open Shielded Vault** to verify client-side range proof generation and commitment derivation.
4. Verify the **Live Vault Explorer** tab loads indexed vaults from the backend.
