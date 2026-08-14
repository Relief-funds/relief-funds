#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    vec, Address, Env, String,
};

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

struct TestEnv {
    env: Env,
    contract_id: Address,
    client: ReliefFundContractClient<'static>,
    /// Contract-level admin
    admin: Address,
    /// A SAC token used for disbursements
    token_id: Address,
    token_admin: Address,
}

impl TestEnv {
    fn setup() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        // Set a deterministic ledger timestamp
        env.ledger().set(LedgerInfo {
            timestamp: 1_700_000_000,
            protocol_version: 21,
            sequence_number: 1,
            network_id: Default::default(),
            base_reserve: 10,
            min_temp_entry_ttl: 1_000,
            min_persistent_entry_ttl: 1_000,
            max_entry_ttl: 100_000,
        });

        let admin = Address::generate(&env);
        let token_admin = Address::generate(&env);

        // Deploy a test SAC token
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone()).address();

        // Register the ReliefFund contract
        let contract_id = env.register(ReliefFundContract, ());

        // SAFETY: the Env lives for the whole test; the client lifetime is tied to it.
        let client = ReliefFundContractClient::new(
            unsafe { &*(&env as *const Env) },
            &contract_id,
        );

        // Initialise
        client.initialize(&admin);

        // Mint tokens into the contract so it can disburse
        let sac = StellarAssetClient::new(&env, &token_id);
        sac.mint(&contract_id, &1_000_000_000_i128); // 1 000 000 tokens (7 decimals)

        Self { env, contract_id, client, admin, token_id, token_admin }
    }

    /// Convenience: create a standard "Flood Response" program and return its id.
    fn create_flood_program(&self) -> u32 {
        let program_admin = self.admin.clone();
        self.client.create_program(
            &String::from_str(&self.env, "Flood Response — Borno State"),
            &String::from_str(&self.env, "Borno, Nigeria"),
            &self.token_id,
            &5_000_000_i128,
            &program_admin,
        )
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation tests
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_initialize_sets_admin() {
    let t = TestEnv::setup();
    let stored_admin = t.client.get_admin();
    assert_eq!(stored_admin, t.admin);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let t = TestEnv::setup();
    let other = Address::generate(&t.env);
    t.client.initialize(&other); // must panic
}

// ─────────────────────────────────────────────────────────────────────────────
// Program tests
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_create_program_returns_sequential_ids() {
    let t = TestEnv::setup();
    let id1 = t.create_flood_program();
    let id2 = t.client.create_program(
        &String::from_str(&t.env, "Drought Relief — Turkana"),
        &String::from_str(&t.env, "Turkana, Kenya"),
        &t.token_id,
        &2_200_000_i128,
        &t.admin,
    );
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(t.client.program_count(), 2);
}

#[test]
fn test_create_program_stores_correct_fields() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    let p = t.client.get_program(&id);
    assert_eq!(p.budget, 5_000_000);
    assert_eq!(p.disbursed, 0);
    assert_eq!(p.recipient_count, 0);
    assert_eq!(p.status, ProgramStatus::Planning);
    assert_eq!(p.admin, t.admin);
}

#[test]
#[should_panic(expected = "budget must be positive")]
fn test_create_program_zero_budget_panics() {
    let t = TestEnv::setup();
    t.client.create_program(
        &String::from_str(&t.env, "Bad Program"),
        &String::from_str(&t.env, "Nowhere"),
        &t.token_id,
        &0_i128,
        &t.admin,
    );
}

#[test]
fn test_activate_program_changes_status() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    t.client.activate_program(&id);
    let p = t.client.get_program(&id);
    assert_eq!(p.status, ProgramStatus::Active);
}

#[test]
#[should_panic(expected = "program is not in Planning status")]
fn test_activate_already_active_panics() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    t.client.activate_program(&id);
    t.client.activate_program(&id); // second call must panic
}

#[test]
fn test_pause_and_resume_program() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    t.client.activate_program(&id);
    t.client.set_program_status(&id, &false);
    assert_eq!(t.client.get_program(&id).status, ProgramStatus::Paused);
    t.client.set_program_status(&id, &true);
    assert_eq!(t.client.get_program(&id).status, ProgramStatus::Active);
}

#[test]
#[should_panic(expected = "program not found")]
fn test_get_nonexistent_program_panics() {
    let t = TestEnv::setup();
    t.client.get_program(&99);
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipient tests
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_add_and_verify_recipient() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    let wallet = Address::generate(&t.env);

    t.client.add_recipient(&id, &wallet, &String::from_str(&t.env, "A. Yusuf"));

    let r = t.client.get_recipient(&id, &wallet);
    assert_eq!(r.status, RecipientStatus::PendingId);
    assert_eq!(r.total_received, 0);

    // program recipient_count bumped
    assert_eq!(t.client.get_program(&id).recipient_count, 1);

    t.client.verify_recipient(&id, &wallet);
    let r2 = t.client.get_recipient(&id, &wallet);
    assert_eq!(r2.status, RecipientStatus::Verified);
}

#[test]
#[should_panic(expected = "recipient already enrolled")]
fn test_add_duplicate_recipient_panics() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    let wallet = Address::generate(&t.env);
    t.client.add_recipient(&id, &wallet, &String::from_str(&t.env, "Alice"));
    t.client.add_recipient(&id, &wallet, &String::from_str(&t.env, "Alice")); // must panic
}

#[test]
fn test_suspend_recipient() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    let wallet = Address::generate(&t.env);
    t.client.add_recipient(&id, &wallet, &String::from_str(&t.env, "Bob"));
    t.client.suspend_recipient(&id, &wallet);
    let r = t.client.get_recipient(&id, &wallet);
    assert_eq!(r.status, RecipientStatus::Suspended);
}

#[test]
#[should_panic(expected = "recipient not found")]
fn test_get_nonexistent_recipient_panics() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    let ghost = Address::generate(&t.env);
    t.client.get_recipient(&id, &ghost);
}

// ─────────────────────────────────────────────────────────────────────────────
// Disbursement tests
// ─────────────────────────────────────────────────────────────────────────────

/// Full happy-path: create program → add & verify 2 recipients → disburse → assert balances.
#[test]
fn test_disburse_happy_path() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    t.client.activate_program(&id);

    let w1 = Address::generate(&t.env);
    let w2 = Address::generate(&t.env);

    t.client.add_recipient(&id, &w1, &String::from_str(&t.env, "A. Yusuf"));
    t.client.add_recipient(&id, &w2, &String::from_str(&t.env, "M. Bello"));
    t.client.verify_recipient(&id, &w1);
    t.client.verify_recipient(&id, &w2);

    let amount_each: i128 = 25_000;
    let seq = t.client.disburse(&id, &vec![&t.env, w1.clone(), w2.clone()], &amount_each);

    assert_eq!(seq, 1);

    // Check on-chain token balances
    let tok = TokenClient::new(&t.env, &t.token_id);
    assert_eq!(tok.balance(&w1), amount_each);
    assert_eq!(tok.balance(&w2), amount_each);

    // Program totals updated
    let p = t.client.get_program(&id);
    assert_eq!(p.disbursed, amount_each * 2);

    // Recipient totals updated
    let r1 = t.client.get_recipient(&id, &w1);
    assert_eq!(r1.total_received, amount_each);

    // Disbursement record stored
    let rec = t.client.get_disbursement(&id, &seq);
    assert_eq!(rec.amount_each, amount_each);
    assert_eq!(rec.seq, 1);
    assert_eq!(rec.timestamp, 1_700_000_000);
    assert_eq!(t.client.disbursement_count(&id), 1);
}

#[test]
fn test_disburse_multiple_batches_increment_seq() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    t.client.activate_program(&id);

    let w1 = Address::generate(&t.env);
    t.client.add_recipient(&id, &w1, &String::from_str(&t.env, "Alice"));
    t.client.verify_recipient(&id, &w1);

    let s1 = t.client.disburse(&id, &vec![&t.env, w1.clone()], &10_000_i128);
    let s2 = t.client.disburse(&id, &vec![&t.env, w1.clone()], &10_000_i128);

    assert_eq!(s1, 1);
    assert_eq!(s2, 2);
    assert_eq!(t.client.disbursement_count(&id), 2);

    let r = t.client.get_recipient(&id, &w1);
    assert_eq!(r.total_received, 20_000);
}

#[test]
#[should_panic(expected = "program is not active")]
fn test_disburse_on_paused_program_panics() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    // deliberately NOT activating — status is Planning

    let w1 = Address::generate(&t.env);
    t.client.add_recipient(&id, &w1, &String::from_str(&t.env, "Alice"));
    t.client.verify_recipient(&id, &w1);
    t.client.disburse(&id, &vec![&t.env, w1], &1_000_i128);
}

#[test]
#[should_panic(expected = "recipient is not verified")]
fn test_disburse_to_unverified_recipient_panics() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    t.client.activate_program(&id);

    let w1 = Address::generate(&t.env);
    t.client.add_recipient(&id, &w1, &String::from_str(&t.env, "Alice"));
    // NOT verified
    t.client.disburse(&id, &vec![&t.env, w1], &1_000_i128);
}

#[test]
#[should_panic(expected = "disbursement exceeds remaining budget")]
fn test_disburse_over_budget_panics() {
    let t = TestEnv::setup();
    let id = t.create_flood_program(); // budget = 5_000_000
    t.client.activate_program(&id);

    let w1 = Address::generate(&t.env);
    t.client.add_recipient(&id, &w1, &String::from_str(&t.env, "Alice"));
    t.client.verify_recipient(&id, &w1);
    // try to disburse more than budget
    t.client.disburse(&id, &vec![&t.env, w1], &6_000_000_i128);
}

#[test]
#[should_panic(expected = "wallets list is empty")]
fn test_disburse_empty_wallets_panics() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    t.client.activate_program(&id);
    t.client.disburse(&id, &vec![&t.env], &1_000_i128);
}

#[test]
#[should_panic(expected = "amount_each must be positive")]
fn test_disburse_zero_amount_panics() {
    let t = TestEnv::setup();
    let id = t.create_flood_program();
    t.client.activate_program(&id);

    let w1 = Address::generate(&t.env);
    t.client.add_recipient(&id, &w1, &String::from_str(&t.env, "Alice"));
    t.client.verify_recipient(&id, &w1);
    t.client.disburse(&id, &vec![&t.env, w1], &0_i128);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin transfer test
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn test_transfer_admin() {
    let t = TestEnv::setup();
    let new_admin = Address::generate(&t.env);
    t.client.transfer_admin(&new_admin);
    assert_eq!(t.client.get_admin(), new_admin);
}
