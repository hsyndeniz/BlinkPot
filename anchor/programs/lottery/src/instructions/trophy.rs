use anchor_lang::prelude::*;
use mpl_core::{
    instructions::CreateCollectionV2CpiBuilder,
    types::{PermanentFreezeDelegate, Plugin, PluginAuthority, PluginAuthorityPair},
    ID as MPL_CORE_ID,
};

use crate::constants::CONFIG_SEED;
use crate::errors::LotteryError;
use crate::events::TrophyCollectionInitialized;
use crate::state::config::Config;

#[derive(Accounts)]
pub struct InitTrophyCollection<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ LotteryError::Unauthorized,
    )]
    pub config: Box<Account<'info, Config>>,

    /// Fresh keypair allocating the new collection account. Signs in the buy
    /// transaction and is consumed by the `create_collection_v2` CPI.
    #[account(mut)]
    pub collection: Signer<'info>,

    /// CHECK: passed as the collection's update authority. The CONFIG PDA is
    /// pinned here so only this lottery program can later sign as `authority`
    /// when minting trophies into the collection (see `claim_winnings`).
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub update_authority: UncheckedAccount<'info>,

    /// CHECK: MPL Core program. Address-checked.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn init_trophy_collection(
    ctx: Context<InitTrophyCollection>,
    name: String,
    uri: String,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.config.trophy_collection,
        Pubkey::default(),
        LotteryError::TrophyCollectionAlreadyInitialized
    );

    // Collection-level PermanentFreezeDelegate with `frozen: true` and an
    // outer `Some(PluginAuthority::None)` makes every asset minted into this
    // collection permanently soulbound: no entity — admin, owner, program —
    // can ever thaw or remove the freeze.
    let plugins = vec![PluginAuthorityPair {
        plugin: Plugin::PermanentFreezeDelegate(PermanentFreezeDelegate { frozen: true }),
        authority: Some(PluginAuthority::None),
    }];

    CreateCollectionV2CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
        .collection(&ctx.accounts.collection.to_account_info())
        .update_authority(Some(&ctx.accounts.update_authority.to_account_info()))
        .payer(&ctx.accounts.admin.to_account_info())
        .system_program(&ctx.accounts.system_program.to_account_info())
        .name(name)
        .uri(uri)
        .plugins(plugins)
        .invoke()?;

    ctx.accounts.config.trophy_collection = ctx.accounts.collection.key();

    emit!(TrophyCollectionInitialized {
        collection: ctx.accounts.collection.key(),
    });
    Ok(())
}
