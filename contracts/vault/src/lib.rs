#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    token, Address, BytesN, Env,
};

// Ledger TTL constants (in ledgers; ~5s each on testnet)
const INSTANCE_TTL_BUMP: u32 = 17_280;   // ~1 day
const PERSISTENT_TTL_BUMP: u32 = 120_960; // ~1 week

#[contracttype]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum VaultStatus {
    Active    = 1,
    Settled   = 2,
    Refunded  = 3,
    Disputed  = 4,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum VaultError {
    NotFound           = 1,
    AlreadySettled     = 2,
    CommitmentMismatch = 3,
    Unauthorized       = 4,
    AlreadyExists      = 5,
    AlreadyInitialized = 6,
    InvalidAmount      = 7,
    DeadlineNotPassed  = 8,
    DeadlinePassed     = 9,
    InvalidParty       = 10,
    InvalidDeadline    = 11,
    VaultNotActive     = 12,
}

#[contracttype]
pub enum DataKey {
    Vault(BytesN<32>),
    Admin,
}

#[contracttype]
#[derive(Clone)]
pub struct VaultState {
    pub buyer:        Address,
    pub seller:       Address,
    pub token:        Address,    // Multi-token: supports USDC, EURC, XLM
    pub commitment:   BytesN<32>, // Pedersen commitment of private trade amount
    pub proof_hash:   BytesN<32>, // SHA-256 of verified Noir proof bytes
    pub amount:       i128,       // Deposited token escrow balance
    pub deadline:     u64,        // Timestamp after which buyer can claim refund
    pub deposit_time: u64,        // Ledger timestamp of vault initialization
    pub status:       VaultStatus,// Lifecycle tracking: Active, Settled, Refunded, Disputed
}

#[contract]
pub struct ShieldedVault;

#[contractimpl]
impl ShieldedVault {
    /// One-time initialization. Guards against re-initialization.
    pub fn init(env: Env, admin: Address) -> Result<(), VaultError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(VaultError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
        Ok(())
    }

    /// Open a shielded vault with multi-token support, validation guards, and a refund deadline.
    pub fn open_vault(
        env: Env,
        vault_id: BytesN<32>,
        buyer: Address,
        seller: Address,
        token: Address,
        commitment: BytesN<32>,
        amount: i128,
        deadline: u64,
    ) -> Result<(), VaultError> {
        buyer.require_auth();

        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        if buyer == seller {
            return Err(VaultError::InvalidParty);
        }
        if deadline <= env.ledger().timestamp() {
            return Err(VaultError::InvalidDeadline);
        }
        if env.storage().persistent().has(&DataKey::Vault(vault_id.clone())) {
            return Err(VaultError::AlreadyExists);
        }

        // Transfer tokens from buyer into this contract (escrow)
        token::Client::new(&env, &token).transfer(
            &buyer,
            &env.current_contract_address(),
            &amount,
        );

        let state = VaultState {
            buyer: buyer.clone(),
            seller: seller.clone(),
            token: token.clone(),
            commitment: commitment.clone(),
            proof_hash: BytesN::from_array(&env, &[0u8; 32]),
            amount,
            deadline,
            deposit_time: env.ledger().timestamp(),
            status: VaultStatus::Active,
        };

        env.storage().persistent().set(&DataKey::Vault(vault_id.clone()), &state);
        env.storage().persistent().extend_ttl(&DataKey::Vault(vault_id.clone()), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        // Structured telemetry event for indexers
        env.events().publish(
            (symbol_short!("opened"), vault_id),
            (buyer, seller, token, amount, deadline, commitment),
        );
        Ok(())
    }

    /// Settle a vault. Relayer/admin calls this after verifying the Noir ZK proof.
    /// Releases escrowed tokens to the seller.
    pub fn settle(
        env: Env,
        vault_id: BytesN<32>,
        proof_hash: BytesN<32>,
        commitment_check: BytesN<32>,
    ) -> Result<(), VaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::Unauthorized)?;
        admin.require_auth();

        let mut state: VaultState = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(vault_id.clone()))
            .ok_or(VaultError::NotFound)?;

        if state.status == VaultStatus::Settled {
            return Err(VaultError::AlreadySettled);
        }
        if state.status != VaultStatus::Active {
            return Err(VaultError::VaultNotActive);
        }
        if state.commitment != commitment_check {
            return Err(VaultError::CommitmentMismatch);
        }

        // Release escrowed tokens to seller
        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &state.seller,
            &state.amount,
        );

        state.proof_hash = proof_hash.clone();
        state.status = VaultStatus::Settled;
        env.storage().persistent().set(&DataKey::Vault(vault_id.clone()), &state);
        env.storage().persistent().extend_ttl(&DataKey::Vault(vault_id.clone()), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        env.events().publish(
            (symbol_short!("settled"), vault_id),
            (state.buyer, state.seller, state.amount, commitment_check, proof_hash),
        );
        Ok(())
    }

    /// Claim refund after the timelock deadline has elapsed.
    /// Protected against premature withdrawal.
    pub fn refund_vault(env: Env, vault_id: BytesN<32>) -> Result<(), VaultError> {
        let mut state: VaultState = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(vault_id.clone()))
            .ok_or(VaultError::NotFound)?;

        if state.status != VaultStatus::Active {
            return Err(VaultError::VaultNotActive);
        }
        if env.ledger().timestamp() < state.deadline {
            return Err(VaultError::DeadlineNotPassed);
        }

        state.buyer.require_auth();

        // Refund escrowed tokens back to buyer
        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &state.buyer,
            &state.amount,
        );

        state.status = VaultStatus::Refunded;
        env.storage().persistent().set(&DataKey::Vault(vault_id.clone()), &state);
        env.storage().persistent().extend_ttl(&DataKey::Vault(vault_id.clone()), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        env.events().publish(
            (symbol_short!("refunded"), vault_id),
            (state.buyer, state.amount),
        );
        Ok(())
    }

    /// Cooperative mutual cancellation: Seller can release funds back to buyer before deadline.
    pub fn cooperative_cancel(env: Env, vault_id: BytesN<32>) -> Result<(), VaultError> {
        let mut state: VaultState = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(vault_id.clone()))
            .ok_or(VaultError::NotFound)?;

        if state.status != VaultStatus::Active {
            return Err(VaultError::VaultNotActive);
        }

        // Seller authorizes refund to buyer
        state.seller.require_auth();

        token::Client::new(&env, &state.token).transfer(
            &env.current_contract_address(),
            &state.buyer,
            &state.amount,
        );

        state.status = VaultStatus::Refunded;
        env.storage().persistent().set(&DataKey::Vault(vault_id.clone()), &state);
        env.storage().persistent().extend_ttl(&DataKey::Vault(vault_id.clone()), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish(
            (symbol_short!("canceled"), vault_id),
            (state.seller, state.buyer, state.amount),
        );
        Ok(())
    }

    /// Flag a vault as disputed by either buyer or seller.
    pub fn dispute_vault(env: Env, vault_id: BytesN<32>, caller: Address) -> Result<(), VaultError> {
        caller.require_auth();

        let mut state: VaultState = env
            .storage()
            .persistent()
            .get(&DataKey::Vault(vault_id.clone()))
            .ok_or(VaultError::NotFound)?;

        if caller != state.buyer && caller != state.seller {
            return Err(VaultError::Unauthorized);
        }
        if state.status != VaultStatus::Active {
            return Err(VaultError::VaultNotActive);
        }

        state.status = VaultStatus::Disputed;
        env.storage().persistent().set(&DataKey::Vault(vault_id.clone()), &state);

        env.events().publish(
            (symbol_short!("disputed"), vault_id),
            (caller, state.amount),
        );
        Ok(())
    }

    /// Read vault state.
    pub fn get_vault(env: Env, vault_id: BytesN<32>) -> Result<VaultState, VaultError> {
        env.storage()
            .persistent()
            .get(&DataKey::Vault(vault_id))
            .ok_or(VaultError::NotFound)
    }

    /// Read contract admin.
    pub fn get_admin(env: Env) -> Result<Address, VaultError> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::NotFound)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };

    fn setup() -> (Env, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 1000);

        let admin       = Address::generate(&env);
        let buyer       = Address::generate(&env);
        let seller      = Address::generate(&env);
        let token_admin = Address::generate(&env);

        let token_contract = env.register_stellar_asset_contract_v2(token_admin);
        let token_addr = token_contract.address();
        StellarAssetClient::new(&env, &token_addr).mint(&buyer, &1_000_000);

        let cid = env.register_contract(None, ShieldedVault);
        ShieldedVaultClient::new(&env, &cid).init(&admin);

        (env, cid, admin, buyer, seller, token_addr)
    }

    #[test]
    fn test_open_and_settle() {
        let (env, cid, _admin, buyer, seller, token) = setup();
        let client = ShieldedVaultClient::new(&env, &cid);
        let tok    = TokenClient::new(&env, &token);

        let vault_id   = BytesN::from_array(&env, &[1u8; 32]);
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let proof_hash = BytesN::from_array(&env, &[3u8; 32]);

        client.open_vault(&vault_id, &buyer, &seller, &token, &commitment, &500_000, &5000);
        assert_eq!(tok.balance(&buyer), 500_000);
        assert_eq!(tok.balance(&cid),   500_000);

        let vault = client.get_vault(&vault_id);
        assert_eq!(vault.status, VaultStatus::Active);
        assert_eq!(vault.deadline, 5000);

        client.settle(&vault_id, &proof_hash, &commitment);
        assert_eq!(tok.balance(&seller), 500_000);
        assert_eq!(tok.balance(&cid),    0);
        assert_eq!(client.get_vault(&vault_id).status, VaultStatus::Settled);
    }

    #[test]
    fn test_reinit_rejected() {
        let (env, cid, admin, _, _, _) = setup();
        let client = ShieldedVaultClient::new(&env, &cid);
        let err = client.try_init(&admin).unwrap_err().unwrap();
        assert_eq!(err, VaultError::AlreadyInitialized);
    }

    #[test]
    fn test_double_settle_rejected() {
        let (env, cid, _admin, buyer, seller, token) = setup();
        let client     = ShieldedVaultClient::new(&env, &cid);
        let vault_id   = BytesN::from_array(&env, &[1u8; 32]);
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let proof_hash = BytesN::from_array(&env, &[3u8; 32]);

        client.open_vault(&vault_id, &buyer, &seller, &token, &commitment, &100, &5000);
        client.settle(&vault_id, &proof_hash, &commitment);

        let err = client.try_settle(&vault_id, &proof_hash, &commitment).unwrap_err().unwrap();
        assert_eq!(err, VaultError::AlreadySettled);
    }

    #[test]
    fn test_commitment_mismatch_rejected() {
        let (env, cid, _admin, buyer, seller, token) = setup();
        let client     = ShieldedVaultClient::new(&env, &cid);
        let vault_id   = BytesN::from_array(&env, &[1u8; 32]);
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let wrong      = BytesN::from_array(&env, &[9u8; 32]);
        let proof_hash = BytesN::from_array(&env, &[3u8; 32]);

        client.open_vault(&vault_id, &buyer, &seller, &token, &commitment, &100, &5000);

        let err = client.try_settle(&vault_id, &proof_hash, &wrong).unwrap_err().unwrap();
        assert_eq!(err, VaultError::CommitmentMismatch);
    }

    #[test]
    fn test_refund_after_deadline_succeeds() {
        let (env, cid, _admin, buyer, seller, token) = setup();
        let client = ShieldedVaultClient::new(&env, &cid);
        let tok    = TokenClient::new(&env, &token);

        let vault_id   = BytesN::from_array(&env, &[4u8; 32]);
        let commitment = BytesN::from_array(&env, &[5u8; 32]);

        client.open_vault(&vault_id, &buyer, &seller, &token, &commitment, &300_000, &2000);
        assert_eq!(tok.balance(&buyer), 700_000);

        // Advance ledger timestamp beyond deadline
        env.ledger().with_mut(|l| l.timestamp = 2500);

        client.refund_vault(&vault_id);
        assert_eq!(tok.balance(&buyer), 1_000_000);
        assert_eq!(tok.balance(&cid), 0);
        assert_eq!(client.get_vault(&vault_id).status, VaultStatus::Refunded);
    }

    #[test]
    fn test_refund_before_deadline_rejected() {
        let (env, cid, _admin, buyer, seller, token) = setup();
        let client = ShieldedVaultClient::new(&env, &cid);

        let vault_id   = BytesN::from_array(&env, &[6u8; 32]);
        let commitment = BytesN::from_array(&env, &[7u8; 32]);

        client.open_vault(&vault_id, &buyer, &seller, &token, &commitment, &300_000, &5000);

        // Ledger timestamp is still 1000 (< 5000)
        let err = client.try_refund_vault(&vault_id).unwrap_err().unwrap();
        assert_eq!(err, VaultError::DeadlineNotPassed);
    }

    #[test]
    fn test_cooperative_cancel() {
        let (env, cid, _admin, buyer, seller, token) = setup();
        let client = ShieldedVaultClient::new(&env, &cid);
        let tok    = TokenClient::new(&env, &token);

        let vault_id   = BytesN::from_array(&env, &[8u8; 32]);
        let commitment = BytesN::from_array(&env, &[9u8; 32]);

        client.open_vault(&vault_id, &buyer, &seller, &token, &commitment, &400_000, &5000);
        assert_eq!(tok.balance(&buyer), 600_000);

        // Seller cooperatively agrees to cancel prior to deadline
        client.cooperative_cancel(&vault_id);
        assert_eq!(tok.balance(&buyer), 1_000_000);
        assert_eq!(client.get_vault(&vault_id).status, VaultStatus::Refunded);
    }

    #[test]
    fn test_invalid_guards() {
        let (env, cid, _admin, buyer, seller, token) = setup();
        let client = ShieldedVaultClient::new(&env, &cid);

        let vault_id   = BytesN::from_array(&env, &[10u8; 32]);
        let commitment = BytesN::from_array(&env, &[11u8; 32]);

        // Negative or zero amount rejected
        let err_amount = client.try_open_vault(&vault_id, &buyer, &seller, &token, &commitment, &0, &5000).unwrap_err().unwrap();
        assert_eq!(err_amount, VaultError::InvalidAmount);

        // Buyer == Seller rejected
        let err_party = client.try_open_vault(&vault_id, &buyer, &buyer, &token, &commitment, &100, &5000).unwrap_err().unwrap();
        assert_eq!(err_party, VaultError::InvalidParty);

        // Expired deadline rejected
        let err_deadline = client.try_open_vault(&vault_id, &buyer, &seller, &token, &commitment, &100, &500).unwrap_err().unwrap();
        assert_eq!(err_deadline, VaultError::InvalidDeadline);
    }
}
