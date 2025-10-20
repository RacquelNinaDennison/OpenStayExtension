#!/bin/bash
set -e

# --- Define Static Keypaths and IDs ---
# Your main wallet to pay for transactions and own the vault.
BACKEND_WALLET=~/backend-wallet.json

# A dedicated keypair for the user (created if it doesn't exist).
USER_WALLET=~/devnet-user-wallet.json

# A dedicated keypair for the Vault Token Account (created if it doesn't exist).
# NOTE: This keypair will be the *address* of the vault account, but the
# *owner* of the account will be the BACKEND_PUBKEY (set below).
VAULT_TOKEN_ACCOUNT_KEYPAIR=~/devnet-vault-token-account.json

# Replace this with your actual, desired USDC Mint address
# (If you don't use a hardcoded one, you must uncomment step 3)
USDC_MINT="9NtgQmpWj5Fv4LiYNLRF6sg9JemkSHug2KwuWoi2CqQY"


# -----------------------------
# 1️⃣ Configure Devnet
# -----------------------------
echo "1️⃣ Configuring Solana to Devnet..."
solana config set --url https://api.devnet.solana.com


# -----------------------------
# 2️⃣ Set Backend Wallet and Get Pubkeys
# -----------------------------

# Create backend wallet if it doesn't exist (optional)
if [ ! -f "$BACKEND_WALLET" ]; then
    solana-keygen new --outfile $BACKEND_WALLET --no-bip39-passphrase
    echo "🔑 Created new backend wallet: $BACKEND_WALLET"
fi

solana config set --keypair $BACKEND_WALLET
BACKEND_PUBKEY=$(solana-keygen pubkey $BACKEND_WALLET)
echo "Using backend wallet: $BACKEND_PUBKEY"
echo "Current balance: $(solana balance)"

# Create user wallet if it doesn't exist
if [ ! -f "$USER_WALLET" ]; then
    solana-keygen new --outfile $USER_WALLET --no-bip39-passphrase
    echo "🔑 Created new user wallet: $USER_WALLET"
fi
USER_PUBKEY=$(solana-keygen pubkey $USER_WALLET)
echo "User wallet public key: $USER_PUBKEY"

# Create keypair for the Vault Token Account address
if [ ! -f "$VAULT_TOKEN_ACCOUNT_KEYPAIR" ]; then
    solana-keygen new --outfile $VAULT_TOKEN_ACCOUNT_KEYPAIR --no-bip39-passphrase
    echo "🔑 Created new vault token account keypair: $VAULT_TOKEN_ACCOUNT_KEYPAIR"
fi
VAULT_TOKEN_ACCOUNT=$(solana-keygen pubkey $VAULT_TOKEN_ACCOUNT_KEYPAIR)


# -----------------------------
# 3️⃣ (Optional) Create USDC token on Devnet
# -----------------------------
# NOTE: Since you hardcoded the mint address above, we skip creation.
# If you ever want to create a NEW mint, UNCOMMENT the following block:
: <<'END_COMMENT'
echo "3️⃣ Creating new USDC Mint..."
USDC_MINT=$(spl-token create-token --fee-payer $BACKEND_WALLET | grep "Creating mint" | awk '{print $NF}')
echo "USDC mint public key: $USDC_MINT"
END_COMMENT
echo "3️⃣ Using existing USDC Mint: $USDC_MINT"

# -----------------------------
# 4️⃣ Create Vault Token Account (Owned by Backend)
# -----------------------------
echo "4️⃣ Creating Vault Token Account at address: $VAULT_TOKEN_ACCOUNT"
# We use the explicit VAULT_TOKEN_ACCOUNT_KEYPAIR as the address
# and specify the $BACKEND_WALLET as the owner.
spl-token create-account \
    $USDC_MINT \
    $VAULT_TOKEN_ACCOUNT_KEYPAIR \
    --owner $BACKEND_WALLET \
    --fee-payer $BACKEND_WALLET

echo "Vault token account: $VAULT_TOKEN_ACCOUNT"


# -----------------------------
# 5️⃣ Create User Token Account
# -----------------------------
echo "5️⃣ Creating User Token Account for $USER_PUBKEY"
# The default behavior is for the second argument (USER_WALLET) to be the owner
# and also the keypair used to generate the account address.
USER_TOKEN_ACCOUNT=$(spl-token create-account $USDC_MINT $USER_WALLET --fee-payer $BACKEND_WALLET)
echo "User token account: $USER_TOKEN_ACCOUNT"


# -----------------------------
# 6️⃣ Mint USDC into Vault (if empty)
# -----------------------------
VAULT_BALANCE=$(spl-token balance $VAULT_TOKEN_ACCOUNT | cut -d ' ' -f 1)
if [ "$VAULT_BALANCE" == "0" ]; then
    echo "6️⃣ Vault is empty. Minting 1000 USDC into vault..."
    spl-token mint $USDC_MINT 1000 $VAULT_TOKEN_ACCOUNT --fee-payer $BACKEND_WALLET
    echo "Vault funded with 1000 USDC"
else
    echo "6️⃣ Vault already has $VAULT_BALANCE USDC. Skipping mint."
fi

# -----------------------------
# 7️⃣ Output .env variables
# -----------------------------
echo "======================"
echo "DEVNET SETUP COMPLETE"
echo ""
echo "--- .env Variables ---"
echo "PRIVATE_KEY_BASE58=$(solana-keygen recover 'prompt://?key=0/0' -o - <<< $(cat $BACKEND_WALLET))"
echo "USDC_MINT=$USDC_MINT"
echo "VAULT_DEPOSIT_ACCOUNT=$VAULT_TOKEN_ACCOUNT"
echo "VAULT_TOKEN_ACCOUNT_KEYPAIR_PATH=$VAULT_TOKEN_ACCOUNT_KEYPAIR"
echo "USER_WALLET_PUBKEY=$USER_PUBKEY"
echo "USER_TOKEN_ACCOUNT=$USER_TOKEN_ACCOUNT"
echo "======================"
