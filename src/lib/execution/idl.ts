export const SYNTHABASKET_IDL = {
  "version": "0.3.0",
  "name": "synthabasket_vault",
  "address": "BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh",
  "metadata": {
    "name": "synthabasket_vault",
    "version": "0.3.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "initializeBasket",
      "discriminator": [246, 234, 106, 12, 103, 95, 178, 166],
      "accounts": [
        { "name": "authority", "isMut": true, "isSigner": true },
        { "name": "basket", "isMut": true, "isSigner": false },
        { "name": "basketMint", "isMut": true, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "rent", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "symbol", "type": "string" },
        { "name": "name", "type": "string" },
        { "name": "constituents", "type": { "vec": "pubkey" } },
        { "name": "weightsBps", "type": { "vec": "u16" } },
        { "name": "protocolFeeBps", "type": "u16" }
      ]
    },
    {
      "name": "depositAndMint",
      "discriminator": [97, 126, 119, 210, 67, 186, 64, 23],
      "accounts": [
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "basket", "isMut": true, "isSigner": false },
        { "name": "basketMint", "isMut": true, "isSigner": false },
        { "name": "userBasketTokenAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "sharesToMint", "type": "u64" },
        { "name": "constituentAmountsIn", "type": { "vec": "u64" } }
      ]
    },
    {
      "name": "burnAndRedeem",
      "discriminator": [2, 82, 184, 230, 13, 208, 102, 164],
      "accounts": [
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "basket", "isMut": true, "isSigner": false },
        { "name": "basketMint", "isMut": true, "isSigner": false },
        { "name": "userBasketTokenAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "sharesToBurn", "type": "u64" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "BasketState",
      "discriminator": [208, 226, 245, 245, 230, 31, 153, 253],
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "pubkey" },
          { "name": "symbol", "type": "string" },
          { "name": "name", "type": "string" },
          { "name": "basketMint", "type": "pubkey" },
          { "name": "constituents", "type": { "vec": "pubkey" } },
          { "name": "weightsBps", "type": { "vec": "u16" } },
          { "name": "protocolFeeBps", "type": "u16" },
          { "name": "totalSharesMinted", "type": "u64" },
          { "name": "vaultReserves", "type": { "vec": "u64" } },
          { "name": "bump", "type": "u8" },
          { "name": "mintBump", "type": "u8" }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "BasketState",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "pubkey" },
          { "name": "symbol", "type": "string" },
          { "name": "name", "type": "string" },
          { "name": "basketMint", "type": "pubkey" },
          { "name": "constituents", "type": { "vec": "pubkey" } },
          { "name": "weightsBps", "type": { "vec": "u16" } },
          { "name": "protocolFeeBps", "type": "u16" },
          { "name": "totalSharesMinted", "type": "u64" },
          { "name": "vaultReserves", "type": { "vec": "u64" } },
          { "name": "bump", "type": "u8" },
          { "name": "mintBump", "type": "u8" }
        ]
      }
    }
  ],
  "errors": [
    { "code": 6000, "name": "SymbolTooLong", "msg": "Basket symbol cannot exceed 10 characters." },
    { "code": 6001, "name": "NameTooLong", "msg": "Basket name cannot exceed 32 characters." },
    { "code": 6002, "name": "EmptyConstituents", "msg": "Constituents array cannot be empty." },
    { "code": 6003, "name": "ConstituentLengthMismatch", "msg": "Constituents array length does not match weights array." },
    { "code": 6004, "name": "InvalidWeightSum", "msg": "Total weight basis points must equal 10,000 (100%)." },
    { "code": 6005, "name": "TooManyConstituents", "msg": "Too many constituents in basket. Maximum is 8." },
    { "code": 6006, "name": "ZeroAmount", "msg": "Amount must be greater than zero." },
    { "code": 6007, "name": "ZeroReserve", "msg": "Vault constituent reserve is zero." },
    { "code": 6008, "name": "SlippageExceeded", "msg": "Deposit amount exceeds acceptable slippage for requested shares." },
    { "code": 6009, "name": "InsufficientShares", "msg": "Insufficient basket shares to burn." },
    { "code": 6010, "name": "InvalidRemainingAccounts", "msg": "Invalid remaining accounts for constituent transfer." },
    { "code": 6011, "name": "MathOverflow", "msg": "Math calculation overflow." },
    { "code": 6012, "name": "InvalidConstituentMint", "msg": "Token account mint does not match the configured basket constituent." },
    { "code": 6013, "name": "InvalidTokenAuthority", "msg": "User token account is not owned by the transaction signer." },
    { "code": 6014, "name": "InvalidVaultAuthority", "msg": "Vault token account is not owned by the basket PDA." }
  ]
};
