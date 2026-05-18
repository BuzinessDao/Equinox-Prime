#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    token, Address, BytesN, Env,
};

// Ledger TTL constants (in ledgers; ~5s each on testnet)
const INSTANCE_TTL_BUMP: u32 = 17_280;   // ~1 day
const PERSISTENT_TTL_BUMP: u32 = 120_960; // ~1 week

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum VaultError {
    NotFound           = 1,
    AlreadySettled     = 2,
    CommitmentMismatch = 3,
    Unauthorized       = 4,
    AlreadyExists      = 5,
    AlreadyInitialized = 6,
}

#[contracttype]
pub enum DataKey {
    Vault(BytesN<32>),
    Admin,
    Token,
}

#[contracttype]
#[derive(Clone)]
pub struct VaultState {
    pub buyer:      Address,
    pub seller:     Address,
    pub commitment: BytesN<32>, // Pedersen commitment — raw amount never stored
    pub proof_hash: BytesN<32>, // SHA-256 of the Noir proof bytes
    pub amount:     i128,       // deposited token amount (not the trade secret — just escrow size)
    pub settled:    bool,
}

#[contract]
pub struct ShieldedVault;

#[contractimpl]
impl ShieldedVault {
    /// One-time initialization. Guards against re-initialization.
    pub fn init(env: Env, admin: Address, token: Address) -> Result<(), VaultError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(VaultError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
        Ok(())
    }

    /// Open a shielded vault. Buyer deposits `amount` tokens into escrow.
    /// The trade value (commitment) is hidden; `amount` is the escrow size.
    pub fn open_vault(
        env: Env,
        vault_id: BytesN<32>,
        buyer: Address,
        seller: Address,
        commitment: BytesN<32>,
        amount: i128,
    ) -> Result<(), VaultError> {
        buyer.require_auth();

        if env.storage().persistent().has(&DataKey::Vault(vault_id.clone())) {
            return Err(VaultError::AlreadyExists);
        }

        // Transfer tokens from buyer into this contract (escrow)
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token_addr).transfer(
            &buyer,
            &env.current_contract_address(),
            &amount,
        );

        let state = VaultState {
            buyer,
            seller,
            commitment,
            proof_hash: BytesN::from_array(&env, &[0u8; 32]),
            amount,
            settled: false,
        };
        env.storage().persistent().set(&DataKey::Vault(vault_id.clone()), &state);
        env.storage().persistent().extend_ttl(&DataKey::Vault(vault_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
        Ok(())
    }

    /// Settle a vault. Only the admin (relayer) may call this after verifying the Noir proof.
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

        if state.settled {
            return Err(VaultError::AlreadySettled);
        }
        if state.commitment != commitment_check {
            return Err(VaultError::CommitmentMismatch);
        }

        // Release escrowed tokens to seller
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        token::Client::new(&env, &token_addr).transfer(
            &env.current_contract_address(),
            &state.seller,
            &state.amount,
        );

        state.proof_hash = proof_hash;
        state.settled = true;
        env.storage().persistent().set(&DataKey::Vault(vault_id.clone()), &state);
        env.storage().persistent().extend_ttl(&DataKey::Vault(vault_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        env.events().publish(
            (symbol_short!("settled"),),
            (state.buyer, state.seller, commitment_check),
        );
        Ok(())
    }

    /// Read vault state. Returns commitment + settled flag; the trade amount is the escrow size only.
    pub fn get_vault(env: Env, vault_id: BytesN<32>) -> Result<VaultState, VaultError> {
        env.storage()
            .persistent()
            .get(&DataKey::Vault(vault_id))
            .ok_or(VaultError::NotFound)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };

    fn setup() -> (Env, Address, Address, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin       = Address::generate(&env);
        let buyer       = Address::generate(&env);
        let seller      = Address::generate(&env);
        let token_admin = Address::generate(&env);

        // register_stellar_asset_contract_v2 returns StellarAssetContract; call .address() for Address
        let token_contract = env.register_stellar_asset_contract_v2(token_admin);
        let token_addr = token_contract.address();
        StellarAssetClient::new(&env, &token_addr).mint(&buyer, &1_000_000);

        let cid = env.register_contract(None, ShieldedVault);
        // client methods for Result-returning fns unwrap on success and panic on error
        ShieldedVaultClient::new(&env, &cid).init(&admin, &token_addr);

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

        client.open_vault(&vault_id, &buyer, &seller, &commitment, &500_000);
        assert_eq!(tok.balance(&buyer), 500_000);
        assert_eq!(tok.balance(&cid),   500_000);

        client.settle(&vault_id, &proof_hash, &commitment);
        assert_eq!(tok.balance(&seller), 500_000);
        assert_eq!(tok.balance(&cid),    0);
        // get_vault returns VaultState directly (not Result) from the generated client
        assert!(client.get_vault(&vault_id).settled);
    }

    #[test]
    fn test_reinit_rejected() {
        let (env, cid, admin, _, _, token) = setup();
        let client = ShieldedVaultClient::new(&env, &cid);
        // try_* returns Result<Result<T, ConversionError>, Result<VaultError, InvokeError>>
        // unwrap_err() gives the Err branch: Result<VaultError, InvokeError>
        // unwrap() on that gives VaultError
        let err = client.try_init(&admin, &token).unwrap_err().unwrap();
        assert_eq!(err, VaultError::AlreadyInitialized);
    }

    #[test]
    fn test_double_settle_rejected() {
        let (env, cid, _admin, buyer, seller, _token) = setup();
        let client     = ShieldedVaultClient::new(&env, &cid);
        let vault_id   = BytesN::from_array(&env, &[1u8; 32]);
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let proof_hash = BytesN::from_array(&env, &[3u8; 32]);

        client.open_vault(&vault_id, &buyer, &seller, &commitment, &100);
        client.settle(&vault_id, &proof_hash, &commitment);

        let err = client.try_settle(&vault_id, &proof_hash, &commitment).unwrap_err().unwrap();
        assert_eq!(err, VaultError::AlreadySettled);
    }

    #[test]
    fn test_commitment_mismatch_rejected() {
        let (env, cid, _admin, buyer, seller, _token) = setup();
        let client     = ShieldedVaultClient::new(&env, &cid);
        let vault_id   = BytesN::from_array(&env, &[1u8; 32]);
        let commitment = BytesN::from_array(&env, &[2u8; 32]);
        let wrong      = BytesN::from_array(&env, &[9u8; 32]);
        let proof_hash = BytesN::from_array(&env, &[3u8; 32]);

        client.open_vault(&vault_id, &buyer, &seller, &commitment, &100);

        let err = client.try_settle(&vault_id, &proof_hash, &wrong).unwrap_err().unwrap();
        assert_eq!(err, VaultError::CommitmentMismatch);
    }
}
