use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("GuKWhJ6x5t42C3WCPbsgyMhbo12kjDSp1bQv55AeaUWX"); // replace with your program id

// -----------------------------
// Accounts + State FIRST
// -----------------------------

#[account]
pub struct Escrow {
    pub initializer: Pubkey,
    pub beneficiary: Pubkey,
    pub mint: Pubkey,
    pub release_ts: i64,
    pub bump: u8,
}
impl Escrow {
    // 32 + 32 + 32 + 8 + 1
    pub const SIZE: usize = 105;
}

#[derive(Accounts)]
#[instruction(amount: u64, release_ts: i64)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,

    /// CHECK: arbitrary pubkey captured into state
    pub beneficiary: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = initializer,
        space = 8 + Escrow::SIZE,
        seeds = [
            b"escrow",
            initializer.key().as_ref(),
            beneficiary.key().as_ref(),
            mint.key().as_ref(),
            &release_ts.to_le_bytes()
        ],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = initializer
    )]
    pub initializer_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = initializer,
        associated_token::mint = mint,
        associated_token::authority = escrow // PDA will be the token authority
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Release<'info> {
    // needs to be mut because it may pay to create the beneficiary ATA
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: must match what was stored; validated indirectly via vault + seeds
    pub beneficiary: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.initializer.as_ref(),
            escrow.beneficiary.as_ref(),
            escrow.mint.as_ref(),
            &escrow.release_ts.to_le_bytes()
        ],
        bump = escrow.bump,
        has_one = mint,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = beneficiary
    )]
    pub beneficiary_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// -----------------------------
// Program module AFTER accounts
// -----------------------------

#[program]
pub mod timelock_escrow {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, amount: u64, release_ts: i64) -> Result<()> {
        // write state
        let escrow = &mut ctx.accounts.escrow;
        escrow.initializer = ctx.accounts.initializer.key();
        escrow.beneficiary = ctx.accounts.beneficiary.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.release_ts = release_ts;
        escrow.bump = ctx.bumps.escrow;

        // pull tokens from initializer -> vault (PDA authority)
        let cpi_accounts = Transfer {
            from: ctx.accounts.initializer_ata.to_account_info(),
            to: ctx.accounts.vault_ata.to_account_info(),
            authority: ctx.accounts.initializer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        // time check
        let clock = Clock::get()?;
        require!(
        clock.unix_timestamp >= ctx.accounts.escrow.release_ts,
        EscrowError::TimelockNotReached
        );

        // transfer all (or you could pass an amount)
        let amount = ctx.accounts.vault_ata.amount;

        // signer seeds for PDA
        let seeds: &[&[u8]] = &[
            b"escrow",
            ctx.accounts.escrow.initializer.as_ref(),
            ctx.accounts.escrow.beneficiary.as_ref(),
            ctx.accounts.escrow.mint.as_ref(),
            &ctx.accounts.escrow.release_ts.to_le_bytes(),
            &[ctx.accounts.escrow.bump],
        ];
        let signer = &[seeds];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_ata.to_account_info(),
            to: ctx.accounts.beneficiary_ata.to_account_info(),
            authority: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer,
        );
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }
}

#[error_code]
pub enum EscrowError {
    #[msg("Release time has not been reached yet")]
    TimelockNotReached,
}
