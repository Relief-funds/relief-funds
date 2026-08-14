/**
 * Stellar / Soroban SDK helpers  (stellar-sdk v16)
 *
 * Wraps all on-chain interactions so API routes stay thin.
 * The `rpc` namespace (formerly `SorobanRpc`) is used for Soroban RPC calls.
 *
 * Required env vars (see .env.example):
 *   STELLAR_NETWORK          – "testnet" | "mainnet"
 *   STELLAR_RPC_URL          – Soroban RPC endpoint
 *   RELIEF_FUND_CONTRACT_ID  – deployed contract C… address
 *   ADMIN_SECRET_KEY         – S… signing keypair for the contract admin
 */

import {
  Contract,
  Keypair,
  Networks,
  rpc as StellarRpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
  Address,
} from "@stellar/stellar-sdk";

// ─────────────────────────────────────────────────────────────────────────────
// Network config
// ─────────────────────────────────────────────────────────────────────────────

function getNetworkPassphrase(): string {
  return process.env.STELLAR_NETWORK === "mainnet"
    ? Networks.PUBLIC
    : Networks.TESTNET;
}

function getRpcServer(): StellarRpc.Server {
  const url =
    process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
  return new StellarRpc.Server(url, { allowHttp: url.startsWith("http://") });
}

function getAdminKeypair(): Keypair {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) throw new Error("ADMIN_SECRET_KEY env var is not set");
  return Keypair.fromSecret(secret);
}

function getContractId(): string {
  const id = process.env.RELIEF_FUND_CONTRACT_ID;
  if (!id) throw new Error("RELIEF_FUND_CONTRACT_ID env var is not set");
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic invoke helper — build, simulate, sign, submit, poll
// ─────────────────────────────────────────────────────────────────────────────

export async function invokeContract(
  method: string,
  args: xdr.ScVal[]
): Promise<unknown> {
  const server = getRpcServer();
  const keypair = getAdminKeypair();
  const contractId = getContractId();
  const networkPassphrase = getNetworkPassphrase();

  const account = await server.getAccount(keypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  // Simulate to populate the transaction footprint + resource fees
  const sim = await server.simulateTransaction(tx);
  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  // Assemble the real transaction with the resource footprint
  const prepared = StellarRpc.assembleTransaction(tx, sim).build();
  prepared.sign(keypair);

  const response = await server.sendTransaction(prepared);
  if (response.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${JSON.stringify(response)}`);
  }

  // Poll until the transaction is confirmed or times out
  const hash = response.hash;
  let getResponse = await server.getTransaction(hash);
  for (let i = 0; i < 20; i++) {
    if (
      getResponse.status !== StellarRpc.Api.GetTransactionStatus.NOT_FOUND
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
    getResponse = await server.getTransaction(hash);
  }

  if (
    getResponse.status === StellarRpc.Api.GetTransactionStatus.SUCCESS &&
    getResponse.returnValue
  ) {
    return scValToNative(getResponse.returnValue);
  }

  if (getResponse.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Transaction reverted: ${hash}`);
  }

  throw new Error(`Transaction timed out: ${hash}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Read-only simulation — no fee, no submission
// ─────────────────────────────────────────────────────────────────────────────

export async function simulateContract(
  method: string,
  args: xdr.ScVal[]
): Promise<unknown> {
  const server = getRpcServer();
  const keypair = getAdminKeypair();
  const contractId = getContractId();
  const networkPassphrase = getNetworkPassphrase();

  const account = await server.getAccount(keypair.publicKey());
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!StellarRpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new Error("Simulation returned no result");
  }
  return scValToNative(sim.result.retval);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed contract wrappers
// ─────────────────────────────────────────────────────────────────────────────

export async function createProgramOnChain(params: {
  name: string;
  region: string;
  tokenAddress: string;
  budget: bigint;
  programAdmin: string;
}): Promise<number> {
  const result = await invokeContract("create_program", [
    nativeToScVal(params.name, { type: "string" }),
    nativeToScVal(params.region, { type: "string" }),
    new Address(params.tokenAddress).toScVal(),
    nativeToScVal(params.budget, { type: "i128" }),
    new Address(params.programAdmin).toScVal(),
  ]);
  return result as number;
}

export async function activateProgramOnChain(programId: number): Promise<void> {
  await invokeContract("activate_program", [
    nativeToScVal(programId, { type: "u32" }),
  ]);
}

export async function setProgramStatusOnChain(
  programId: number,
  active: boolean
): Promise<void> {
  await invokeContract("set_program_status", [
    nativeToScVal(programId, { type: "u32" }),
    nativeToScVal(active),
  ]);
}

export async function addRecipientOnChain(params: {
  programId: number;
  wallet: string;
  name: string;
}): Promise<void> {
  await invokeContract("add_recipient", [
    nativeToScVal(params.programId, { type: "u32" }),
    new Address(params.wallet).toScVal(),
    nativeToScVal(params.name, { type: "string" }),
  ]);
}

export async function verifyRecipientOnChain(
  programId: number,
  wallet: string
): Promise<void> {
  await invokeContract("verify_recipient", [
    nativeToScVal(programId, { type: "u32" }),
    new Address(wallet).toScVal(),
  ]);
}

export async function suspendRecipientOnChain(
  programId: number,
  wallet: string
): Promise<void> {
  await invokeContract("suspend_recipient", [
    nativeToScVal(programId, { type: "u32" }),
    new Address(wallet).toScVal(),
  ]);
}

export async function disburseOnChain(params: {
  programId: number;
  wallets: string[];
  amountEach: bigint;
}): Promise<{ seq: number; txHash?: string }> {
  const walletsScVal = xdr.ScVal.scvVec(
    params.wallets.map((w) => new Address(w).toScVal())
  );
  const seq = await invokeContract("disburse", [
    nativeToScVal(params.programId, { type: "u32" }),
    walletsScVal,
    nativeToScVal(params.amountEach, { type: "i128" }),
  ]);
  return { seq: seq as number };
}

export async function getProgramOnChain(programId: number): Promise<unknown> {
  return simulateContract("get_program", [
    nativeToScVal(programId, { type: "u32" }),
  ]);
}

export async function getRecipientOnChain(
  programId: number,
  wallet: string
): Promise<unknown> {
  return simulateContract("get_recipient", [
    nativeToScVal(programId, { type: "u32" }),
    new Address(wallet).toScVal(),
  ]);
}

export async function getProgramCountOnChain(): Promise<number> {
  const result = await simulateContract("program_count", []);
  return result as number;
}
