# Autiv

## Introduction

Autiv is an on-chain subscription service built for the **MetaMask Smart Accounts x Monad Dev Cook Off** hackathon. The platform empowers builders to launch recurring payment plans that settle directly on Monad testnet while abstracting away complex smart-account operations. We combine **MetaMask smart accounts and delegation flows** with **Envio HyperSync RPC** to verify on-chain payment events inside our API layer, ensuring fast and reliable subscription management.

## LINKS:
- Website: https://autiv.xyz
- Dev: https://x.com/WagmiArc (Team size: 1)

## Project Overview

- **Smart Accounts & Delegation**: Users approve subscriptions through MetaMask smart accounts while granting the Autiv manager delegated permissions for automated renewals.
- **Real-time Event Verification**: HyperSync RPC from Envio lets the backend confirm payment finality before updating off-chain state.
- **Automatic Recurring Payment**: Due subscriptions are automatically collected through an Agent.
- **Unified Monorepo**: This repository contains the end-user frontend (`app/frontend/`), a payment widget site (`app/payment-site/`), Cloudflare Worker APIs (`worker/autiv/`), and supporting scripts.

## Repository Layout

- `app/frontend/` – Main dashboard and subscription management UI (Vite + React + TypeScript).
- `app/payment-site/` – Lightweight checkout experience surfaced to customers.
- `worker/autiv/` – Cloudflare Worker gateway handling API requests, smart contract verification, and database interactions.
- `app/database/` – Utility scripts for database tasks and migrations (PostgreSQL / Xata bridge).

## Prerequisites

- **Node.js** v18+ (recommended).
- **npm** or **pnpm** for dependency management.
- Access to a **Cloudflare** account for deploying the worker.
- Credentials for **Xata** (used as the backing data store) and PostgreSQL connection for migration helpers.
- MetaMask wallet configured for Monad testnet.

## Environment Variables

Create `.env` files in the relevant project directories (these values are required for local development and deployment).

### Frontend (`app/frontend/.env`)

```
VITE_ALCHEMY_API_KEY=
VITE_PROJECT_ID=
VITE_ALCHEMY_GAS_POLICY_ID=
VITE_PRIVY_APP_ID=
VITE_DEMO_PROJECT_ID=
VITE_WORKER_URL=
VITE_PAYMENT_SITE=
```
### Frontend (`app/frontend/src/config/chain.ts`)
Change this AGENT_ADDRESS
```
export const AGENT_ADDRESS = '0x406b16A36926814305dF25757c93d298b639Bef0'
```
to the address that will be used to collect due subscriptions
```
export const AGENT_ADDRESS = '<YOUR AGENT ADDRESS HERE>'
```

### Smart contracts setup (`/contracts`)
Add environment variables
```
EOA_PRIVATE_KEY = 
ALCHEMY_POLICY_ID =
DEPLOYER_PRIVATE_KEY=
HYPERSYNC_API=
MONAD_RPC_URL=
DATABASE_URL
```
> Note: EOA_PRIVATE_KEY is private key for agent address that will later be used for collection payment. `DATABASE_URL` is a postgres url of your Xata Database.


Deploy the Subscription Manager (replace the USDC address in `/contracts/contract/scripts/deploy-monad.ts` to your own token

```bash
npm run deploy:monad
```
Copy `SUBSCRIPTION_MANAGER` and `USDC_ADDRESS` values in `deployment-addresses.json` and prepare for database setup

Collection due subscriptions (You are currently in /contracts)
```bash
cd/payment_processor
node collect_payment.js
```
### Payment Site (`app/payment-site/.env`)

Use the same keys as the frontend when the payment widget needs to reference shared services:

```
VITE_ALCHEMY_API_KEY=
VITE_PROJECT_ID=
VITE_ALCHEMY_GAS_POLICY_ID=
VITE_WORKER_URL=
```


### Database setup (`worker/autiv/.dev.vars` or environment variables in the dashboard)

```
DATABASE_URL=
DATABASE_URL_HTTPS=
XATA_API_KEY=
```

> **Note:** `DATABASE_URL` is the PostgreSQL connection string used by helper scripts `migrate.js` to setup database, while `DATABASE_URL_HTTPS` is required by Xata’s HTTP API to test if needed. 

### Cloudflare worker setup
```
PRIVY_APP_ID=
DATABASE_URL_HTTPS=
XATA_API_KEY=
HYPERSYNC_API=
```

> **Note:** Use `npx wrangler secret put <ENV KEY HERE>` to add environment variables to Cloudflare.


## Setup Instructions

### 1. Clone and install dependencies

```bash
git clone https://github.com/Vinhhjk/Autiv.git
cd Autiv

# Install shared dependencies per workspace
cd app/frontend && npm install
cd ../payment-site && npm install
cd ../../worker/autiv && npm install
# return to repo root when done
```

If you use `pnpm`, run `pnpm install` in each workspace instead.

### 2. Configure environment files

Populate the variables listed above for each app. For local development you can copy `.env.example` files where available:

```bash
cp app/frontend/.env.example app/frontend/.env
cp app/payment-site/.env.example app/payment-site/.env
cp worker/autiv/.dev.vars.example worker/autiv/.dev.vars
```

Update the placeholders with real API keys (Alchemy, Privy, HyperSync, etc.), project IDs, and worker URLs.

### 3. Run the frontend locally

```bash
cd app/frontend
npm run dev
```

Visit `http://localhost:5173` to access the main dashboard. The app auto-connects to the Cloudflare worker for subscriptions, wallet auth (Privy), and contract reads.

### 4. Run the payment site locally

```bash
cd app/payment-site
npm run dev
```

Use the URL printed in the console (defaults to `http://localhost:5174`). Configure `VITE_PAYMENT_SITE` in the frontend to point at the deployed payment widget.

### 5. Run the worker locally

```bash
cd worker/autiv
npm install    # if not already done
npx wrangler dev
```

Wrangler will expose the worker on `http://127.0.0.1:8787`. Ensure the `.dev.vars` file contains the correct secrets before starting.

## Database & Xata Setup

Autiv persists subscription metadata in Xata while mirroring critical identifiers in PostgreSQL for analytics/migrations.

- Provision a Xata workspace and note the API key (`XATA_API_KEY`).
- Create the necessary tables (`projects`, `subscription_plans`, `user_subscriptions`, etc.) following the schema defined in `worker/autiv/src/index.js` helpers.
- Supply both `DATABASE_URL` and `DATABASE_URL_HTTPS` for scripts under `app/database/`.
- Copy the ID of the 1st project and add`VITE_DEMO_PROJECT_ID` to `.env` in `app/frontend`.

> HyperSync RPC endpoints from Envio should be configured inside the worker to guarantee payment events are confirmed before database updates.

## Deployment Notes

- **Frontend / Payment Site**: Deploy to Netlify or Vercel by pointing to `app/frontend/` and `app/payment-site/` respectively. Set the same environment variables in the hosting platform.
- **Cloudflare Worker**: Deploy with `wrangler deploy` from `worker/autiv/` after configuring production secrets via Cloudflare dashboard.
- **Database**: Keep Xata schema synchronized between environments and refresh `VITE_DEMO_PROJECT_ID` when seeding demo data.

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/my-update`).
3. Commit your changes (`git commit -am "feat: add new feature"`).
4. Push to GitHub and open a pull request.

## License

This project is currently distributed for hackathon purposes. Contact the https://x.com/WagmiArc for licensing questions.