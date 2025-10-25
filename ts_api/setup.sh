#!/usr/bin/env bash
set -euo pipefail

AMOUNT_UI="200" 
DECIMALS="6"      
AIRDROP_SOL=""    

usage() {
  cat <<EOF
Usage: $(basename "$0") -i <INITIALIZER_PUBKEY> -m <MINT_PUBKEY> [-a <amount_ui>] [-d <decimals>] [--airdrop <SOL>]

Examples:
  $(basename "$0") -i BTR7...YBm -m 7hxV...Gnga
  $(basename "$0") -i <guest_pubkey> -m <your_devnet_mint> -a 150 -d 6 --airdrop 1

Notes:
  • You must be the MINT AUTHORITY of <mint> to mint tokens.
  • Script will create the initializer's ATA if missing and then mint to it.
EOF
  exit 1
}

INIT=""
MINT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i) INIT="$2"; shift 2 ;;
    -m) MINT="$2"; shift 2 ;;
    -a) AMOUNT_UI="$2"; shift 2 ;;
    -d) DECIMALS="$2"; shift 2 ;;
    --airdrop) AIRDROP_SOL="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1"; usage ;;
  esac
done

[[ -z "${INIT}" || -z "${MINT}" ]] && usage

command -v solana >/dev/null || { echo "ERR: 'solana' CLI not found"; exit 1; }
command -v spl-token >/dev/null || { echo "ERR: 'spl-token' CLI not found"; exit 1; }

echo "==> Setting Solana config to devnet"
solana config set -u devnet >/dev/null

if [[ -n "${AIRDROP_SOL}" ]]; then
  PAYER=$(solana address)
  echo "==> Airdropping ${AIRDROP_SOL} SOL to ${PAYER}"
  solana airdrop "${AIRDROP_SOL}" "${PAYER}" || true
fi

echo "==> Inputs"
echo "    Initializer: ${INIT}"
echo "    Mint       : ${MINT}"
echo "    Amount (UI): ${AMOUNT_UI}"
echo "    Decimals   : ${DECIMALS}"

to_base() {
  local ui="$1" dec="$2"
  if command -v node >/dev/null 2>&1; then
    node -e "const [ui,dec]=process.argv.slice(1);const [i,f='']=ui.split('.');const frac=(f+'0'.repeat(dec)).slice(0,dec);const v=(BigInt(i||0)*10n**BigInt(dec))+BigInt(frac||0);console.log(v.toString())" "$ui" "$dec"
  elif command -v python3 >/dev/null 2>&1; then
    python3 - <<PY "$ui" "$dec"
import sys
ui,dec = sys.argv[1], int(sys.argv[2])
i,_,f = ui.partition('.')
frac = (f + '0'*dec)[:dec]
v = int(i or '0')*(10**dec) + int(frac or '0')
print(v)
PY
  else
    echo "Need node or python3 to compute base units" >&2
    exit 1
  fi
}

AMOUNT_BASE="$(to_base "${AMOUNT_UI}" "${DECIMALS}")"
echo "==> Amount (base units): ${AMOUNT_BASE}"

get_ata() {
  local owner="$1" mint="$2"

  # Try without --verbose
  if ATA=$(spl-token -u devnet address --token "${mint}" --owner "${owner}" 2>/dev/null); then
    echo "${ATA}"
    return 0
  fi

  # Try with --verbose and parse the line “Associated token address: <addr>”
  if OUT=$(spl-token -u devnet address --verbose --token "${mint}" --owner "${owner}" 2>/dev/null); then
    ATA=$(echo "${OUT}" | awk '/Associated token address:/ {print $4; exit}')
    if [[ -n "${ATA:-}" ]]; then
      echo "${ATA}"
      return 0
    fi
  fi

  # Fallback: list accounts and filter by mint
  OUT=$(spl-token -u devnet accounts --owner "${owner}" | awk -v m="${mint}" '
    BEGIN{addr=""}
    /Account:/{acc=$2}
    /Mint:/{
      if ($2==m) { addr=acc; print addr; exit }
    }')
  if [[ -n "${OUT}" ]]; then
    echo "${OUT}"
    return 0
  fi

  return 1
}

echo "==> Deriving initializer ATA"
if ! ATA=$(get_ata "${INIT}" "${MINT}"); then
  echo "    Could not derive ATA via CLI; will attempt create-account and re-check"
  # create-account (idempotent/no-op if exists)
  spl-token -u devnet create-account "${MINT}" --owner "${INIT}" || true
  if ! ATA=$(get_ata "${INIT}" "${MINT}"); then
    echo "ERROR: Unable to derive initializer ATA for owner=${INIT} mint=${MINT}"
    exit 1
  fi
fi
echo "    ATA: ${ATA}"

echo "==> Ensuring ATA exists"
set +e
CREATE_OUT=$(spl-token -u devnet create-account "${MINT}" --owner "${INIT}" 2>&1)
RC=$?
set -e
if [[ $RC -ne 0 ]]; then
  if echo "${CREATE_OUT}" | grep -qiE "already in use|exists"; then
    echo "    ATA already exists"
  else
    echo "    create-account returned non-zero (continuing):"
    echo "    ${CREATE_OUT}"
  fi
else
  echo "    ATA created"
fi

echo "==> Minting ${AMOUNT_UI} (=${AMOUNT_BASE} base) to ${ATA}"
set +e
MINT_OUT=$(spl-token -u devnet mint "${MINT}" "${AMOUNT_BASE}" "${ATA}" 2>&1)
MINT_RC=$?
set -e
if [[ $MINT_RC -ne 0 ]]; then
  echo "ERROR: Mint failed. Are you the mint authority for ${MINT}?"
  echo "${MINT_OUT}"
  exit 1
fi
echo "    Mint tx ok"

echo "==> Balances for ${INIT} (this mint)"
spl-token -u devnet accounts --owner "${INIT}" | awk -v mint="${MINT}" '
  /Account:/ {acc=$2}
  /Mint:/    {m=$2}
  /Amount:/  {amt=$2; if (m==mint) { printf("  %s  %s\n", acc, amt) } }
'

echo "==> Done."
