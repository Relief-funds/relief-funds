/*!
 * ReliefFund — Soroban smart contract
 *
 * Manages humanitarian aid programs on Stellar.
 *
 * Concepts
 * --------
 * Program   — a named relief campaign with a token, budget cap, and admin
 * Recipient — a beneficiary wallet enrolled in a program, subject to KYC verification
 * Disbursement — a single on-chain transfer from the program escrow to one recipient
 *
 * Storage layout (all persistent)
 * --------------------------------
 * DataKey::Admin                            → Address
 * DataKey::Program(program_id)              → Program
 * DataKey::ProgramCount                     → u32
 * DataKey::Recipient(program_id, address)   → Recipient
 * DataKey::DisbursementCount(program_id)    → u32
 * DataKey::Disbursement(program_id, seq)    → DisbursementRecord
 */

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token, vec, Address, Env, String, Symbol, Vec,
};

// ─────────────────────────────────────────────────────────────────────────────
// Data types
// ─────────────────────────────────────────────────────────────────────────────

/// Status of a relief program.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum ProgramStatus {
    Planning,
    Active,
    Paused,
    Closed,
}

/// A relief program stored on-chain.
#[contracttype]
#[derive(Clone)]
pub struct Program {
    /// Human-readable name, e.g. "Flood Response — Borno State"
    pub name: String,
    /// Geographic label, e.g. "Borno, Nigeria"
    pub region: String,
    /// SAC / asset contract address used for disbursements (e.g. USDC on Stellar)
    pub token: Address,
    /// Maximum total tokens that can be disbursed (in token stroops)
    pub budget: i128,
    /// Tokens already disbursed
    pub disbursed: i128,
    /// Number of enrolled recipients
    pub recipient_count: u32,
    pub status: ProgramStatus,
    /// Program administrator — can enroll recipients and trigger disbursements
    pub admin: Address,
}

/// KYC / enrollment status of a recipient.
#[contracttype]
#[derive(Clone, PartialEq)]
pub enum RecipientStatus {
    PendingId,
    Verified,
    Suspended,
}

/// A recipient enrolled in a specific program.
#[contracttype]
#[derive(Clone)]
pub struct Recipient {
    pub wallet: Address,
    pub name: String,
    pub status: RecipientStatus,
    /// Total tokens received across all disbursements in this program
    pub total_received: i128,
}

/// An individual disbursement event.
#[contracttype]
#[derive(Clone)]
pub struct DisbursementRecord {
    pub program_id: u32,
    /// Sequential index within the program (1-based)
    pub seq: u32,
    /// Recipient wallets included in this batch
    pub recipients: Vec<Address>,
    /// Tokens sent to each recipient (uniform per batch)
    pub amount_each: i128,
    /// Ledger timestamp of execution
    pub timestamp: u64,
    pub triggered_by: Address,
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    ProgramCount,
    Program(u32),
    Recipient(u32, Address),
    DisbursementCount(u32),
    Disbursement(u32, u32),
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

const PROG_CREATED: Symbol = symbol_short!("prog_new");
const RECIP_ADDED: Symbol = symbol_short!("recip_add");
const RECIP_VERIF: Symbol = symbol_short!("recip_ver");
const DISBURSE: Symbol = symbol_short!("disburse");

// ─────────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────────

#[contract]
pub struct ReliefFundContract;

#[contractimpl]
impl ReliefFundContract {
    // ───────────────────────────────────────────────────────────────────────
    // Initialisation
    // ───────────────────────────────────────────────────────────────────────

    /// Deploy and set the contract-level admin.
    /// Must be called exactly once; subsequent calls panic.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().persistent().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::ProgramCount, &0u32);
    }

    // ───────────────────────────────────────────────────────────────────────
    // Programs
    // ───────────────────────────────────────────────────────────────────────

    /// Create a new relief program. Only the contract admin may call this.
    /// Returns the newly assigned program_id.
    pub fn create_program(
        env: Env,
        name: String,
        region: String,
        token: Address,
        budget: i128,
        program_admin: Address,
    ) -> u32 {
        Self::require_admin(&env);
        if budget <= 0 {
            panic!("budget must be positive");
        }

        let count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::ProgramCount)
            .unwrap_or(0);
        let program_id = count + 1;

        let program = Program {
            name: name.clone(),
            region,
            token,
            budget,
            disbursed: 0,
            recipient_count: 0,
            status: ProgramStatus::Planning,
            admin: program_admin,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);
        env.storage()
            .persistent()
            .set(&DataKey::ProgramCount, &program_id);
        env.storage()
            .persistent()
            .set(&DataKey::DisbursementCount(program_id), &0u32);

        env.events()
            .publish((PROG_CREATED,), (program_id, name));

        program_id
    }

    /// Activate a program (moves it from Planning → Active).
    pub fn activate_program(env: Env, program_id: u32) {
        let mut program = Self::get_program_or_panic(&env, program_id);
        program.admin.require_auth();
        if program.status != ProgramStatus::Planning {
            panic!("program is not in Planning status");
        }
        program.status = ProgramStatus::Active;
        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);
    }

    /// Pause / resume a program. Only program admin.
    pub fn set_program_status(env: Env, program_id: u32, active: bool) {
        let mut program = Self::get_program_or_panic(&env, program_id);
        program.admin.require_auth();
        program.status = if active {
            ProgramStatus::Active
        } else {
            ProgramStatus::Paused
        };
        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);
    }

    /// Read a program by id.
    pub fn get_program(env: Env, program_id: u32) -> Program {
        Self::get_program_or_panic(&env, program_id)
    }

    /// Return the total number of programs ever created.
    pub fn program_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::ProgramCount)
            .unwrap_or(0)
    }

    // ───────────────────────────────────────────────────────────────────────
    // Recipients
    // ───────────────────────────────────────────────────────────────────────

    /// Enroll a recipient in a program. Only the program admin may do this.
    pub fn add_recipient(
        env: Env,
        program_id: u32,
        wallet: Address,
        name: String,
    ) {
        let mut program = Self::get_program_or_panic(&env, program_id);
        program.admin.require_auth();

        let key = DataKey::Recipient(program_id, wallet.clone());
        if env.storage().persistent().has(&key) {
            panic!("recipient already enrolled");
        }

        let recipient = Recipient {
            wallet: wallet.clone(),
            name: name.clone(),
            status: RecipientStatus::PendingId,
            total_received: 0,
        };
        env.storage().persistent().set(&key, &recipient);

        program.recipient_count += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);

        env.events()
            .publish((RECIP_ADDED,), (program_id, wallet, name));
    }

    /// Mark a recipient as KYC-verified. Only program admin.
    pub fn verify_recipient(env: Env, program_id: u32, wallet: Address) {
        let program = Self::get_program_or_panic(&env, program_id);
        program.admin.require_auth();

        let key = DataKey::Recipient(program_id, wallet.clone());
        let mut recipient: Recipient = env
            .storage()
            .persistent()
            .get(&key)
            .expect("recipient not found");
        recipient.status = RecipientStatus::Verified;
        env.storage().persistent().set(&key, &recipient);

        env.events().publish((RECIP_VERIF,), (program_id, wallet));
    }

    /// Suspend a recipient (blocks future disbursements to them).
    pub fn suspend_recipient(env: Env, program_id: u32, wallet: Address) {
        let program = Self::get_program_or_panic(&env, program_id);
        program.admin.require_auth();

        let key = DataKey::Recipient(program_id, wallet.clone());
        let mut recipient: Recipient = env
            .storage()
            .persistent()
            .get(&key)
            .expect("recipient not found");
        recipient.status = RecipientStatus::Suspended;
        env.storage().persistent().set(&key, &recipient);
    }

    /// Read a recipient's record.
    pub fn get_recipient(env: Env, program_id: u32, wallet: Address) -> Recipient {
        env.storage()
            .persistent()
            .get(&DataKey::Recipient(program_id, wallet))
            .expect("recipient not found")
    }

    // ───────────────────────────────────────────────────────────────────────
    // Disbursements
    // ───────────────────────────────────────────────────────────────────────

    /// Disburse `amount_each` tokens to every address in `wallets`.
    ///
    /// Pre-conditions:
    ///   - Caller must be the program admin (requires_auth)
    ///   - Program must be Active
    ///   - Each wallet must be Verified
    ///   - Total disbursement must not exceed remaining budget
    ///   - This contract must hold sufficient token balance (funded externally via SAC transfer)
    ///
    /// Returns the disbursement sequence number.
    pub fn disburse(
        env: Env,
        program_id: u32,
        wallets: Vec<Address>,
        amount_each: i128,
    ) -> u32 {
        let mut program = Self::get_program_or_panic(&env, program_id);
        program.admin.require_auth();

        if program.status != ProgramStatus::Active {
            panic!("program is not active");
        }
        if wallets.is_empty() {
            panic!("wallets list is empty");
        }
        if amount_each <= 0 {
            panic!("amount_each must be positive");
        }

        let total = amount_each
            .checked_mul(wallets.len() as i128)
            .expect("overflow");
        let remaining = program.budget - program.disbursed;
        if total > remaining {
            panic!("disbursement exceeds remaining budget");
        }

        // Validate all recipients before any transfer
        for wallet in wallets.iter() {
            let key = DataKey::Recipient(program_id, wallet.clone());
            let recip: Recipient = env
                .storage()
                .persistent()
                .get(&key)
                .expect("recipient not found in program");
            if recip.status != RecipientStatus::Verified {
                panic!("recipient is not verified");
            }
        }

        // Execute token transfers via SAC (Stellar Asset Contract)
        let token_client = token::Client::new(&env, &program.token);
        let contract_addr = env.current_contract_address();

        for wallet in wallets.iter() {
            token_client.transfer(&contract_addr, &wallet, &amount_each);

            // Update recipient totals
            let key = DataKey::Recipient(program_id, wallet.clone());
            let mut recip: Recipient = env.storage().persistent().get(&key).unwrap();
            recip.total_received += amount_each;
            env.storage().persistent().set(&key, &recip);
        }

        // Persist disbursement record
        let seq: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::DisbursementCount(program_id))
            .unwrap_or(0)
            + 1;

        let record = DisbursementRecord {
            program_id,
            seq,
            recipients: wallets.clone(),
            amount_each,
            timestamp: env.ledger().timestamp(),
            triggered_by: program.admin.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Disbursement(program_id, seq), &record);
        env.storage()
            .persistent()
            .set(&DataKey::DisbursementCount(program_id), &seq);

        // Update program totals
        program.disbursed += total;
        env.storage()
            .persistent()
            .set(&DataKey::Program(program_id), &program);

        env.events().publish(
            (DISBURSE,),
            (program_id, seq, wallets, amount_each, total),
        );

        seq
    }

    /// Read a disbursement record by program_id + seq.
    pub fn get_disbursement(env: Env, program_id: u32, seq: u32) -> DisbursementRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Disbursement(program_id, seq))
            .expect("disbursement not found")
    }

    /// Total number of disbursements in a program.
    pub fn disbursement_count(env: Env, program_id: u32) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::DisbursementCount(program_id))
            .unwrap_or(0)
    }

    // ───────────────────────────────────────────────────────────────────────
    // Admin helpers
    // ───────────────────────────────────────────────────────────────────────

    /// Transfer the contract-level admin role.
    pub fn transfer_admin(env: Env, new_admin: Address) {
        Self::require_admin(&env);
        new_admin.require_auth();
        env.storage().persistent().set(&DataKey::Admin, &new_admin);
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("not initialized")
    }

    // ───────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ───────────────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
    }

    fn get_program_or_panic(env: &Env, program_id: u32) -> Program {
        env.storage()
            .persistent()
            .get(&DataKey::Program(program_id))
            .expect("program not found")
    }
}

// Export types for use in tests / bindings
pub use ReliefFundContract as Contract;

mod test;
