use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh");

pub const MAX_CONSTITUENTS: usize = 8;
pub const BASIS_POINTS_DIVISOR: u64 = 10_000;

#[program]
pub mod synthabasket_vault {
    use super::*;

    pub fn initialize_basket(
        ctx: Context<InitializeBasket>,
        symbol: String,
        name: String,
        constituents: Vec<Pubkey>,
        weights_bps: Vec<u16>,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        require!(symbol.len() <= 10, BasketError::SymbolTooLong);
        require!(name.len() <= 32, BasketError::NameTooLong);
        require!(constituents.len() == weights_bps.len(), BasketError::ConstituentLengthMismatch);
        require!(!constituents.is_empty(), BasketError::EmptyConstituents);
        require!(constituents.len() <= MAX_CONSTITUENTS, BasketError::TooManyConstituents);

        let total_weight: u32 = weights_bps.iter().map(|&w| w as u32).sum();
        require!(total_weight == 10_000, BasketError::InvalidWeightSum);

        let basket = &mut ctx.accounts.basket;
        basket.authority = ctx.accounts.authority.key();
        basket.symbol = symbol;
        basket.name = name;
        basket.basket_mint = ctx.accounts.basket_mint.key();
        basket.constituents = constituents.clone();
        basket.weights_bps = weights_bps;
        basket.protocol_fee_bps = protocol_fee_bps;
        basket.total_shares_minted = 0;
        basket.vault_reserves = vec![0u64; constituents.len()];
        basket.bump = ctx.bumps.basket;
        basket.mint_bump = ctx.bumps.basket_mint;

        msg!("Initialized SynthaBasket: {} ({}) with {} constituents", basket.name, basket.symbol, basket.constituents.len());
        Ok(())
    }

    pub fn deposit_and_mint<'info>(
        ctx: Context<'_, '_, '_, 'info, DepositAndMint<'info>>,
        shares_to_mint: u64,
        constituent_amounts_in: Vec<u64>,
    ) -> Result<()> {
        let basket = &mut ctx.accounts.basket;
        require!(shares_to_mint > 0, BasketError::ZeroAmount);
        require!(
            constituent_amounts_in.len() == basket.constituents.len(),
            BasketError::ConstituentLengthMismatch
        );

        // Calculate and enforce strict share accounting
        if basket.total_shares_minted == 0 {
            // First mint: seed liquidity sets the initial reserves
            for (i, &amount) in constituent_amounts_in.iter().enumerate() {
                require!(amount > 0, BasketError::ZeroAmount);
                basket.vault_reserves[i] = amount;
            }
        } else {
            // Subsequent mints: shares are proportional to minimum deposited constituent fraction
            let mut min_proportional_shares = u64::MAX;
            for (i, &amount) in constituent_amounts_in.iter().enumerate() {
                let current_reserve = basket.vault_reserves[i];
                require!(current_reserve > 0, BasketError::ZeroReserve);
                // shares_i = amount * total_shares / current_reserve
                let shares_i = (amount as u128)
                    .checked_mul(basket.total_shares_minted as u128)
                    .ok_or(BasketError::MathOverflow)?
                    .checked_div(current_reserve as u128)
                    .ok_or(BasketError::MathOverflow)? as u64;

                if shares_i < min_proportional_shares {
                    min_proportional_shares = shares_i;
                }
                basket.vault_reserves[i] = basket.vault_reserves[i]
                    .checked_add(amount)
                    .ok_or(BasketError::MathOverflow)?;
            }

            require!(
                shares_to_mint <= min_proportional_shares,
                BasketError::SlippageExceeded
            );
        }

        // Execute CPI transfers from user token accounts to vault token accounts
        let num_constituents = basket.constituents.len();
        let remaining_accounts = ctx.remaining_accounts;
        require!(
            remaining_accounts.len() == num_constituents * 2,
            BasketError::InvalidRemainingAccounts
        );

        for i in 0..num_constituents {
            let user_token_info = &remaining_accounts[i * 2];
            let vault_token_info = &remaining_accounts[i * 2 + 1];
            let amount = constituent_amounts_in[i];

            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: user_token_info.to_account_info(),
                        to: vault_token_info.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                    },
                ),
                amount,
            )?;
        }

        // CPI Mint basket shares to user using PDA signer seeds
        let symbol_bytes = basket.symbol.as_bytes();
        let mint_seeds: &[&[u8]] = &[
            b"basket_mint",
            symbol_bytes,
            &[basket.mint_bump],
        ];
        let signer_seeds = &[&mint_seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.basket_mint.to_account_info(),
                    to: ctx.accounts.user_basket_token_account.to_account_info(),
                    authority: ctx.accounts.basket_mint.to_account_info(),
                },
                signer_seeds,
            ),
            shares_to_mint,
        )?;

        basket.total_shares_minted = basket
            .total_shares_minted
            .checked_add(shares_to_mint)
            .ok_or(BasketError::MathOverflow)?;

        msg!(
            "Minted {} shares of basket {} to {}. Total shares now: {}",
            shares_to_mint,
            basket.symbol,
            ctx.accounts.user.key(),
            basket.total_shares_minted
        );
        Ok(())
    }

    pub fn burn_and_redeem<'info>(
        ctx: Context<'_, '_, '_, 'info, BurnAndRedeem<'info>>,
        shares_to_burn: u64,
    ) -> Result<()> {
        let basket = &mut ctx.accounts.basket;
        require!(shares_to_burn > 0, BasketError::ZeroAmount);
        require!(
            basket.total_shares_minted >= shares_to_burn,
            BasketError::InsufficientShares
        );

        let num_constituents = basket.constituents.len();
        let remaining_accounts = ctx.remaining_accounts;
        require!(
            remaining_accounts.len() == num_constituents * 2,
            BasketError::InvalidRemainingAccounts
        );

        // Burn basket shares from user
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.basket_mint.to_account_info(),
                    from: ctx.accounts.user_basket_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            shares_to_burn,
        )?;

        // Release proportional constituent tokens from Vault PDA to user
        let symbol_bytes = basket.symbol.as_bytes();
        let basket_seeds: &[&[u8]] = &[
            b"basket",
            symbol_bytes,
            &[basket.bump],
        ];
        let signer_seeds = &[&basket_seeds[..]];

        for i in 0..num_constituents {
            let vault_token_info = &remaining_accounts[i * 2];
            let user_token_info = &remaining_accounts[i * 2 + 1];

            let amount_out = (basket.vault_reserves[i] as u128)
                .checked_mul(shares_to_burn as u128)
                .ok_or(BasketError::MathOverflow)?
                .checked_div(basket.total_shares_minted as u128)
                .ok_or(BasketError::MathOverflow)? as u64;

            basket.vault_reserves[i] = basket.vault_reserves[i]
                .checked_sub(amount_out)
                .ok_or(BasketError::MathOverflow)?;

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: vault_token_info.to_account_info(),
                        to: user_token_info.to_account_info(),
                        authority: basket.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount_out,
            )?;
        }

        basket.total_shares_minted = basket
            .total_shares_minted
            .checked_sub(shares_to_burn)
            .ok_or(BasketError::MathOverflow)?;

        msg!(
            "Burned {} shares of basket {} from {}. Remaining shares: {}",
            shares_to_burn,
            basket.symbol,
            ctx.accounts.user.key(),
            basket.total_shares_minted
        );
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(symbol: String)]
pub struct InitializeBasket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = BasketState::LEN,
        seeds = [b"basket", symbol.as_bytes()],
        bump
    )]
    pub basket: Account<'info, BasketState>,

    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = basket_mint,
        seeds = [b"basket_mint", symbol.as_bytes()],
        bump
    )]
    pub basket_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DepositAndMint<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"basket", basket.symbol.as_bytes()],
        bump = basket.bump
    )]
    pub basket: Account<'info, BasketState>,

    #[account(
        mut,
        seeds = [b"basket_mint", basket.symbol.as_bytes()],
        bump = basket.mint_bump
    )]
    pub basket_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_basket_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BurnAndRedeem<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"basket", basket.symbol.as_bytes()],
        bump = basket.bump
    )]
    pub basket: Account<'info, BasketState>,

    #[account(
        mut,
        seeds = [b"basket_mint", basket.symbol.as_bytes()],
        bump = basket.mint_bump
    )]
    pub basket_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_basket_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[account]
pub struct BasketState {
    pub authority: Pubkey,
    pub symbol: String,
    pub name: String,
    pub basket_mint: Pubkey,
    pub constituents: Vec<Pubkey>,
    pub weights_bps: Vec<u16>,
    pub protocol_fee_bps: u16,
    pub total_shares_minted: u64,
    pub vault_reserves: Vec<u64>,
    pub bump: u8,
    pub mint_bump: u8,
}

impl BasketState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        4 + 10 + // symbol
        4 + 32 + // name
        32 + // basket_mint
        4 + (32 * MAX_CONSTITUENTS) + // constituents
        4 + (2 * MAX_CONSTITUENTS) + // weights_bps
        2 + // protocol_fee_bps
        8 + // total_shares_minted
        4 + (8 * MAX_CONSTITUENTS) + // vault_reserves
        1 + // bump
        1; // mint_bump
}

#[error_code]
pub enum BasketError {
    #[msg("Basket symbol cannot exceed 10 characters.")]
    SymbolTooLong,
    #[msg("Basket name cannot exceed 32 characters.")]
    NameTooLong,
    #[msg("Constituents array cannot be empty.")]
    EmptyConstituents,
    #[msg("Constituents array length does not match weights array.")]
    ConstituentLengthMismatch,
    #[msg("Total weight basis points must equal 10,000 (100%).")]
    InvalidWeightSum,
    #[msg("Too many constituents in basket. Maximum is 8.")]
    TooManyConstituents,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("Vault constituent reserve is zero.")]
    ZeroReserve,
    #[msg("Deposit amount exceeds acceptable slippage for requested shares.")]
    SlippageExceeded,
    #[msg("Insufficient basket shares to burn.")]
    InsufficientShares,
    #[msg("Invalid remaining accounts for constituent transfer.")]
    InvalidRemainingAccounts,
    #[msg("Math calculation overflow.")]
    MathOverflow,
}
