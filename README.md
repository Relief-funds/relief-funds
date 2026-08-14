# Relief Funds

**Transparent aid disbursement platform** — coordinate humanitarian relief programs, verify recipients, and disburse funds on the Stellar blockchain with a full audit trail.

---

## Overview

Relief Funds is a full-stack web application that lets NGOs and aid coordinators:

- Create and manage **relief programs** (e.g. flood response, drought relief)
- Enroll and **KYC-verify recipients** with Stellar wallet addresses
- **Disburse tokens** to verified recipients in batch via a Soroban smart contract
- Track every transaction with an **immutable on-chain audit trail**
- Generate **reports** for donors and auditors

The disbursement flow goes: **DB (off-chain index) → Soroban smart contract (on-chain execution) → Stellar network (settlement)**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui |
| Backend | Next.js API routes (Node.js) |
| Database | SQLite via Prisma 7 + `@prisma/adapter-libsql` |
| Smart contract | Soroban (Rust) on Stellar |
| Blockchain SDK | `@stellar/stellar-sdk` v16 |
| Package manager | pnpm |

---

## Project Structure

```
relief-funds/
├── app/
│   ├── api/
│   │   ├── programs/          # GET, POST /api/programs
│   │   │   └── [id]/          # GET, PATCH /api/programs/:id
│   │   ├── recipients/        # GET, POST /api/recipients
│   │   │   └── [id]/          # GET, PATCH /api/recipients/:id
│   │   ├── disbursements/     # GET, POST /api/disbursements
│   │   │   └── [id]/          # GET /api/disbursements/:id
│   │   └── reports/           # GET /api/reports
│   ├── page.tsx               # Main dashboard UI
│   ├── layout.tsx
│   └── globals.css
├── contracts/
│   └── relief_fund/
│       └── src/
│           ├── lib.rs         # Soroban smart contract
│           └── test.rs        # 16 contract tests
├── lib/
│   ├── db.ts                  # Prisma client singleton
│   ├── stellar.ts             # Soroban SDK helpers
│   └── utils.ts
├── prisma/
│   └── schema.prisma          # DB schema
├── prisma.config.ts           # Prisma 7 config
├── .env.example               # Environment variable template
└── pnpm-workspace.yaml
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- A Stellar testnet account ([generate one here](https://laboratory.stellar.org/#account-creator))

### 1. Clone and install

```bash
git clone https://github.com/brightfootlimited-collab/relief-funds.git
cd relief-funds
pnpm install --prefer-offline
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

```env
DATABASE_URL="file:./prisma/dev.db"
STELLAR_NETWORK="testnet"
STELLAR_RPC_URL="https://soroban-testnet.stellar.org"
RELIEF_FUND_CONTRACT_ID="C..."      # after deploying the contract
ADMIN_SECRET_KEY="S..."             # your testnet signing keypair
DEFAULT_TOKEN_ADDRESS="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Set up the database

```bash
pnpm db:generate   # generates the Prisma client
pnpm db:push       # creates prisma/dev.db with all tables
```

### 4. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Smart Contract

The Soroban contract (`contracts/relief_fund/src/lib.rs`) manages:

| Method | Description |
|---|---|
| `initialize(admin)` | Deploy and set contract admin |
| `create_program(...)` | Create a named relief program with token + budget |
| `activate_program(id)` | Move program from Planning → Active |
| `add_recipient(...)` | Enroll a beneficiary wallet |
| `verify_recipient(...)` | Mark recipient as KYC-verified |
| `disburse(id, wallets, amount)` | Transfer tokens to all verified recipients |
| `get_program(id)` | Read a program (view call) |
| `get_disbursement(id, seq)` | Read a disbursement record |

### Deploy the contract

```bash
# Install Stellar CLI
cargo install --locked stellar-cli

# Build
cd contracts
cargo build --target wasm32-unknown-unknown --release

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/relief_fund.wasm \
  --source <YOUR_SECRET_KEY> \
  --network testnet

# Initialize (copy the C... address into RELIEF_FUND_CONTRACT_ID)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <YOUR_SECRET_KEY> \
  --network testnet \
  -- initialize --admin <YOUR_PUBLIC_KEY>
```

### Run contract tests

```bash
cd contracts
cargo test
```

---

## API Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/programs` | List all programs |
| POST | `/api/programs` | Create a program |
| GET | `/api/programs/:id` | Get a program with recipients |
| PATCH | `/api/programs/:id` | Update status or notes |
| GET | `/api/recipients` | List recipients (filter by `?programId=`) |
| POST | `/api/recipients` | Enroll a recipient |
| PATCH | `/api/recipients/:id` | Verify or suspend a recipient |
| GET | `/api/disbursements` | List disbursements (filter by `?programId=`) |
| POST | `/api/disbursements` | Execute a disbursement batch |
| GET | `/api/disbursements/:id` | Get a single disbursement |
| GET | `/api/reports` | Aggregated donor/auditor reports |

All write routes persist to SQLite first, then mirror to the Soroban contract best-effort (on-chain failures are logged but don't fail the HTTP response).

---

## Database Schema

```
Program          — relief campaigns (name, region, token, budget, status)
Recipient        — beneficiary wallets enrolled in a program
Disbursement     — batch transfer events
DisbursementRecipient — join table
AuditLog         — immutable append-only trail of all actions
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | SQLite file path, e.g. `file:./prisma/dev.db` |
| `STELLAR_NETWORK` | Yes | `testnet` or `mainnet` |
| `STELLAR_RPC_URL` | Yes | Soroban RPC endpoint |
| `RELIEF_FUND_CONTRACT_ID` | Yes | Deployed contract C… address |
| `ADMIN_SECRET_KEY` | Yes | Stellar signing keypair (S…) |
| `DEFAULT_TOKEN_ADDRESS` | Yes | SAC address of disbursement token |
| `NEXT_PUBLIC_APP_URL` | No | Base URL for the app |

---

## License

MIT
