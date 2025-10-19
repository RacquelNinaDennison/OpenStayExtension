package service

import (
	"OpenStay/config"
	"context"
	"encoding/binary"
	"fmt"
	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/associated-token-account"
	"github.com/gagliardetto/solana-go/rpc"
	"github.com/gagliardetto/solana-go/rpc/jsonrpc"
)

type VaultService struct {
	cfg    *config.Config
	client *rpc.Client
}

func NewVaultService(cfg *config.Config) *VaultService {
	return &VaultService{
		cfg:    cfg,
		client: rpc.New(cfg.RpcURL),
	}
}

func (v *VaultService) DepositUSDC(wallet solana.PrivateKey, userUSDCAccount solana.PublicKey, amount uint64) (string, error) {
	ctx := context.Background()

	// --- Program and Account IDs ---
	vaultProgram := solana.MustPublicKeyFromBase58(v.cfg.VaultProgramID)
	vaultDepositAcct := solana.MustPublicKeyFromBase58(v.cfg.VaultDepositAcct)

	// Standard Solana Program IDs
	splTokenProgramID := solana.TokenProgramID
	// FIX: The Associated Token Program ID constant name
	associatedTokenProgramID := solana.SPLAssociatedTokenAccountProgramID

	// Vault-specific accounts (These keys must be accurate for the dELbEtKGo19R4H9qmvuji7AXfqvqC1DDr5BUFVHons4 program)
	vaultShareMint := solana.MustPublicKeyFromBase58(v.cfg.VaultShareMint) // Read from config
	vaultStateAcct := solana.MustPublicKeyFromBase58(v.cfg.VaultStateAcct) // NOTE: If these were not provided by the vault creator, they would need to be calculated as PDAs.

	// 1. Derive the User's Associated Token Account (ATA) for the Vault Share Mint
	userShareAcct, _, err := solana.FindAssociatedTokenAddress(wallet.PublicKey(), vaultShareMint)
	if err != nil {
		return "", fmt.Errorf("failed to derive user share ATA: %w", err)
	}

	// 2. Create the Associated Token Account (ATA) instruction if it does not exist.
	createATAInstruction := associatedtokenaccount.NewCreateInstruction(
		wallet.PublicKey(), // Payer
		wallet.PublicKey(), // Owner
		vaultShareMint,     // Mint
	).Build()

	// 3. Define all accounts for the Vault Deposit instruction (0x01)
	// The order is critical and must match the vault program's IDL.
	accounts := solana.AccountMetaSlice{
		// 0. The Vault State PDA (Writable)
		{PublicKey: vaultStateAcct, IsSigner: false, IsWritable: true},
		// 1. The User's Wallet/Authority (Signer, Non-Writable)
		{PublicKey: wallet.PublicKey(), IsSigner: true, IsWritable: false},
		// 2. The User's USDC Token Account (Writable) - Source of USDC
		{PublicKey: userUSDCAccount, IsSigner: false, IsWritable: true},
		// 3. The Vault's Deposit USDC Token Account (Writable) - Destination of USDC
		{PublicKey: vaultDepositAcct, IsSigner: false, IsWritable: true},
		// 4. The Vault's Share Mint (Writable) - Mint for LP tokens
		{PublicKey: vaultShareMint, IsSigner: false, IsWritable: true},
		// 5. The User's Share Token Account (Writable) - Destination for LP tokens
		{PublicKey: userShareAcct, IsSigner: false, IsWritable: true},

		// --- Required Programs for CPIs ---
		// 6. SPL Token Program ID
		{PublicKey: splTokenProgramID, IsSigner: false, IsWritable: false},
		// 7. System Program ID (for creating the ATA)
		{PublicKey: solana.SystemProgramID, IsSigner: false, IsWritable: false},
		// 8. Associated Token Program ID (FIXED: ATokenAddr -> AssociatedTokenAccountProgramID)
		{PublicKey: associatedTokenProgramID, IsSigner: false, IsWritable: false},
	}

	// Instruction data: 0x01 (Deposit) followed by the amount
	data := make([]byte, 1+8)
	data[0] = 0x01
	binary.LittleEndian.PutUint64(data[1:], amount)

	depositIx := solana.NewInstruction(
		vaultProgram,
		accounts,
		data,
	)

	latest, err := v.client.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return "", fmt.Errorf("failed to get recent blockhash: %w", err)
	}

	tx, err := solana.NewTransaction(
		[]solana.Instruction{createATAInstruction, depositIx},
		latest.Value.Blockhash,
		solana.TransactionPayer(wallet.PublicKey()),
	)
	if err != nil {
		return "", fmt.Errorf("failed to build tx: %w", err)
	}

	tx.Sign(func(pub solana.PublicKey) *solana.PrivateKey {
		if pub.Equals(wallet.PublicKey()) {
			return &wallet
		}
		return nil
	})

	sig, err := v.client.SendTransaction(ctx, tx)
	if err != nil {
		if rpcErr, ok := err.(*jsonrpc.RPCError); ok {
			return "", fmt.Errorf("rpc error: %v", rpcErr)
		}
		return "", err
	}

	return sig.String(), nil
}
