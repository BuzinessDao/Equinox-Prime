// balance_validator - Equinox Prime ZK circuit
// Proves: amount in [min, max] using bit-decomposition range checks,
// bound to a Pedersen commitment, without revealing the amount.

// Assert value fits in N bits (i.e. value < 2^N).
// In nargo >= 0.36, to_le_bits() takes no args; width is inferred from [u1; N].
fn assert_n_bits<let N: u32>(value: Field) {
    let bits: [u1; N] = value.to_le_bits();
    // Recompose and check round-trip to prevent malleability
    let mut recomposed: Field = 0;
    let mut power: Field = 1;
    for i in 0..N {
        recomposed += (bits[i] as Field) * power;
        power *= 2;
    }
    assert(recomposed == value);
}

fn main(
    amount:  Field,         // private: actual trade value in stroops
    blinding: Field,        // private: random blinding factor
    commitment: pub Field,  // public: Pedersen(amount, blinding).x
    min: pub Field,         // public: agreed lower bound
    max: pub Field,         // public: agreed upper bound
) {
    // 1. Verify the Pedersen commitment binds to the private amount
    let computed = std::hash::pedersen_commitment([amount, blinding]);
    assert(computed.x == commitment);

    // 2. ZK range proof via bit decomposition.
    //    Prove 0 <= (amount - min) and 0 <= (max - amount)
    //    by asserting both differences fit in 64 bits.
    assert_n_bits::<64>(amount - min);
    assert_n_bits::<64>(max - amount);
}

#[test]
fn test_valid_range() {
    let amount: Field   = 500_000;
    let blinding: Field = 0x1234abcd;
    let min: Field      = 100_000;
    let max: Field      = 1_000_000;

    let commitment = std::hash::pedersen_commitment([amount, blinding]);
    main(amount, blinding, commitment.x, min, max);
}

#[test(should_fail)]
fn test_below_min_fails() {
    let amount: Field   = 50_000; // below min
    let blinding: Field = 0xdeadbeef;
    let min: Field      = 100_000;
    let max: Field      = 1_000_000;

    let commitment = std::hash::pedersen_commitment([amount, blinding]);
    main(amount, blinding, commitment.x, min, max);
}

#[test(should_fail)]
fn test_above_max_fails() {
    let amount: Field   = 2_000_000; // above max
    let blinding: Field = 0xdeadbeef;
    let min: Field      = 100_000;
    let max: Field      = 1_000_000;

    let commitment = std::hash::pedersen_commitment([amount, blinding]);
    main(amount, blinding, commitment.x, min, max);
}

#[test(should_fail)]
fn test_wrong_commitment_fails() {
    let amount: Field   = 500_000;
    let blinding: Field = 0x1234abcd;
    let min: Field      = 100_000;
    let max: Field      = 1_000_000;

    main(amount, blinding, 0xdeadbeef, min, max); // wrong commitment
}
