package config

import (
	"log"
	"os"
)

type Config struct {
	RpcURL           string
	PrivateKeyBase58 string
	JupiterAPI       string
	SolMint          string
	UsdcMint         string
	VaultProgramID   string
	VaultDepositAcct string
	VaultStateAcct   string
	VaultShareMint   string
}

func Load() *Config {
	c := &Config{
		RpcURL:           os.Getenv("RPC_URL"),
		PrivateKeyBase58: os.Getenv("PRIVATE_KEY_BASE58"),
		JupiterAPI:       os.Getenv("JUPITER_API"),
		SolMint:          os.Getenv("SOL_MINT"),
		UsdcMint:         os.Getenv("USDC_MINT"),
		VaultProgramID:   os.Getenv("VAULT_PROGRAM_ID"),
		VaultDepositAcct: os.Getenv("VAULT_DEPOSIT_ACCT"),
		VaultStateAcct:   os.Getenv("VAULT_STATE_ACCT"),
		VaultShareMint:   os.Getenv("VAULT_SHARE_MINT"),
	}

	if c.RpcURL == "" {
		log.Fatal("Missing RPC URL in .env")
	}
	if c.VaultStateAcct == "" || c.VaultShareMint == "" || c.VaultDepositAcct == "" || c.VaultProgramID == "" {
		log.Fatal("Missing one or more required Vault Public Keys (e.g., VAULT_STATE_ACCT, VAULT_SHARE_MINT)")
	}

	return c
}
