#!/usr/bin/env bash
set -euo pipefail

# ==============================
# Local Solana setup for testing
# ==============================

# --- Settings ---
# Set to the local validator 
RPC_URL="http://127.0.0.1:8899"
BACKEND_WALLET="${HOME}/backend-wallet.json"
USER_WALLET="${HOME}/local-user-wallet.json"
MINT_DECIMALS=6
MINT_AMOUNT_BASEUNITS=500000000   # 500 USDC with 6 decimals
TOKEN_PROGRAM_ID="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"

echo "Ensuring the solana test validator is on"
echo "   solana-test-validator --reset"
echo

have_jq() { command -v jq >/dev/null 2>&1; }

wait_for_rpc() {
  echo "Waiting for $RPC_URL..."
  for _ in {1..30}; do
    if solana -u "$RPC_URL" cluster-version >/dev/null 2>&1; then
      echo "RPC is up ($RPC_URL)"
      return 0
    fi
    sleep 1
  done
  echo "RPC not reachable at $RPC_URL" >&2
  exit 1
}

airdrop_retry() {
  local amount="$1" pk="$2"
  for _ in {1..5}; do
    if solana airdrop "$amount" "$pk" --url "$RPC_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "Airdrop failed for $pk (amount $amount). Continuing anyway." >&2
}

extract_pubkey_like() {
  # Extracts Base58 strings 32-44 chars and filters out the SPL Token program id.
  # Reads from stdin.
  tr -d '\r' |
  grep -Eo '[" ]([1-9A-HJ-NP-Za-km-z]{32,44})[" ]' | tr -d '" ' |
  grep -v "^${TOKEN_PROGRAM_ID}\$" |
  tail -n 1 || true
}

parse_mint_from_output() {
  # Try jq .address, then JSON regex, then generic base58, in that order.
  local out="$1"
  local candidate=""

  if have_jq; then
    candidate=$(printf '%s' "$out" | jq -er '.address' 2>/dev/null || true)
  fi
  if [[ -z "${candidate:-}" || "$candidate" == "null" ]]; then
    candidate=$(printf '%s' "$out" | grep -Eo '"address"\s*:\s*"[1-9A-HJ-NP-Za-km-z]{32,44}"' \
      | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' \
      | grep -v "^${TOKEN_PROGRAM_ID}\$" \
      | tail -n 1 || true)
  fi
  if [[ -z "${candidate:-}" ]]; then
    candidate=$(printf '%s' "$out" | extract_pubkey_like)
  fi
  printf '%s' "${candidate:-}"
}

ensure_nonempty_address() {
  local label="$1" value="$2" raw="$3"
  if [[ -z "$value" || "$value" == "null" || "$value" == "$TOKEN_PROGRAM_ID" ]]; then
    echo "$label parse failed."
    echo "── raw output start ─────────────────────────────────────────────────"
    printf '%s\n' "$raw"
    echo "── raw output end ───────────────────────────────────────────────────"
    echo "Tips:"
    echo "• Make sure spl-token is installed and recent: spl-token --version"
    echo "• The command supports --output json? If not, we fall back to regex."
    echo "• We filter out the Token Program id to avoid false positives."
    exit 1
  fi
}

# --- Start ---
# starting validator 
wait_for_rpc

# Point solana CLI at localnet + ensure wallets
solana config set --url "$RPC_URL" >/dev/null

[ -f "$BACKEND_WALLET" ] || solana-keygen new --outfile "$BACKEND_WALLET" --no-bip39-passphrase -s >/dev/null
[ -f "$USER_WALLET" ]    || solana-keygen new --outfile "$USER_WALLET"    --no-bip39-passphrase -s >/dev/null

solana config set --keypair "$BACKEND_WALLET" >/dev/null

BACKEND_PUBKEY=$(solana-keygen pubkey "$BACKEND_WALLET")
USER_PUBKEY=$(solana-keygen pubkey "$USER_WALLET")

echo "Backend: $BACKEND_PUBKEY"
echo "User:    $USER_PUBKEY"

# Airdrops for fees
airdrop_retry 100 "$BACKEND_PUBKEY"
airdrop_retry  50 "$USER_PUBKEY"

# --- Create mint (TEST USDC) ---
# Always capture stdout+stderr so we can parse/display on failure.
CREATE_MINT_OUT=$(spl-token create-token \
  --decimals "$MINT_DECIMALS" \
  --url "$RPC_URL" \
  --fee-payer "$BACKEND_WALLET" \
  --output json 2>&1 || true)

# If the CLI doesn't support --output json, retry without it (capture too).
if ! printf '%s' "$CREATE_MINT_OUT" | grep -q '"address"'; then
  ALT_CREATE_MINT_OUT=$(spl-token create-token \
    --decimals "$MINT_DECIMALS" \
    --url "$RPC_URL" \
    --fee-payer "$BACKEND_WALLET" 2>&1 || true)
  # Prefer whichever contains something usable
  if printf '%s' "$ALT_CREATE_MINT_OUT" | grep -Eqo '[1-9A-HJ-NP-Za-km-z]{32,44}'; then
    CREATE_MINT_OUT="$ALT_CREATE_MINT_OUT"
  fi
fi

TEST_USDC_MINT=$(parse_mint_from_output "$CREATE_MINT_OUT")
ensure_nonempty_address "TEST_USDC_MINT" "$TEST_USDC_MINT" "$CREATE_MINT_OUT"
echo "TEST_USDC_MINT=$TEST_USDC_MINT"

# --- Create ATAs ---
CREATE_ACC_VAULT_OUT=$(spl-token create-account "$TEST_USDC_MINT" \
  --owner "$BACKEND_PUBKEY" \
  --url "$RPC_URL" \
  --fee-payer "$BACKEND_WALLET" \
  --output json 2>&1 || true)
if ! printf '%s' "$CREATE_ACC_VAULT_OUT" | grep -q '"address"'; then
  ALT_CREATE_ACC_VAULT_OUT=$(spl-token create-account "$TEST_USDC_MINT" \
    --owner "$BACKEND_PUBKEY" \
    --url "$RPC_URL" \
    --fee-payer "$BACKEND_WALLET" 2>&1 || true)
  if printf '%s' "$ALT_CREATE_ACC_VAULT_OUT" | grep -Eqo '[1-9A-HJ-NP-Za-km-z]{32,44}'; then
    CREATE_ACC_VAULT_OUT="$ALT_CREATE_ACC_VAULT_OUT"
  fi
fi
VAULT_DEPOSIT_ATA=$(parse_mint_from_output "$CREATE_ACC_VAULT_OUT")
ensure_nonempty_address "VAULT_DEPOSIT_ATA" "$VAULT_DEPOSIT_ATA" "$CREATE_ACC_VAULT_OUT"

CREATE_ACC_USER_OUT=$(spl-token create-account "$TEST_USDC_MINT" \
  --owner "$USER_PUBKEY" \
  --url "$RPC_URL" \
  --fee-payer "$BACKEND_WALLET" \
  --output json 2>&1 || true)
if ! printf '%s' "$CREATE_ACC_USER_OUT" | grep -q '"address"'; then
  ALT_CREATE_ACC_USER_OUT=$(spl-token create-account "$TEST_USDC_MINT" \
    --owner "$USER_PUBKEY" \
    --url "$RPC_URL" \
    --fee-payer "$BACKEND_WALLET" 2>&1 || true)
  if printf '%s' "$ALT_CREATE_ACC_USER_OUT" | grep -Eqo '[1-9A-HJ-NP-Za-km-z]{32,44}'; then
    CREATE_ACC_USER_OUT="$ALT_CREATE_ACC_USER_OUT"
  fi
fi
USER_USDC_ATA=$(parse_mint_from_output "$CREATE_ACC_USER_OUT")
ensure_nonempty_address "USER_USDC_ATA" "$USER_USDC_ATA" "$CREATE_ACC_USER_OUT"

echo "VAULT_DEPOSIT_ATA=$VAULT_DEPOSIT_ATA"
echo "USER_USDC_ATA=$USER_USDC_ATA"

# --- Mint tokens to the user (acts like a local "swap") ---
MINT_TX_OUT=$(spl-token mint "$TEST_USDC_MINT" "$MINT_AMOUNT_BASEUNITS" "$USER_USDC_ATA" \
  --url "$RPC_URL" \
  --fee-payer "$BACKEND_WALLET" 2>&1 || true)
if ! printf '%s' "$MINT_TX_OUT" | grep -Eqi 'Signature|minting|confirmed|success'; then
  echo " Minting output (for reference):"
  printf '%s\n' "$MINT_TX_OUT"
fi

# --- Output env hints ---
cat <<EOF
======================
LOCALNET SETUP COMPLETE

# Backend .env suggestions
RPC_URL=$RPC_URL
PRIVATE_KEY_PATH=$BACKEND_WALLET
USDCTokenMint=$TEST_USDC_MINT
VaultDepositAcct=$VAULT_DEPOSIT_ATA
VaultShareMint=<YOUR_LOCAL_SHARE_MINT>          # from your vault init
VaultStateAcct=<YOUR_LOCAL_VAULT_STATE_PDA>     # from your vault init
VaultProgramID=<YOUR_LOCAL_VAULT_PROGRAM_ID>    # after you deploy locally

# For testing requests
USER_WALLET_PUBKEY=$USER_PUBKEY
USER_USDC_ATA=$USER_USDC_ATA
======================
EOF
