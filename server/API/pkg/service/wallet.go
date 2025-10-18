package service

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
	"solana-converter/pkg/model"
)

/*
SolanaClientInterface defines the contract for Solana transaction operations.

Methods:
  - CheckSOLBalance: Verify if a wallet has sufficient SOL for a transaction.
  - ConvertSOLToUSDC: Execute a swap from SOL to USDC and return transaction details.
*/
type SolanaClientInterface interface {
	CheckSOLBalance(ctx context.Context, walletID string, requiredAmount float64) (bool, error)
	ConvertSOLToUSDC(ctx context.Context, walletPublicKey string, solAmount float64) (*model.ConversionDetails, error)
}

/*
SolanaClient is the concrete implementation of SolanaClientInterface.

Attributes:
  - rpcClient (*rpc.Client): A connected Solana RPC client used for network operations.
*/
type SolanaClient struct {
	rpcClient *rpc.Client
}

/*
NewSolanaClient creates a new Solana RPC client.

Arguments:
  - rpcURL (string): The URL endpoint of the Solana RPC node.

Returns:
  - *SolanaClient: A fully initialized Solana client ready for balance checks and swaps.
*/
func NewSolanaClient(rpcURL string) *SolanaClient {
	return &SolanaClient{
		rpcClient: rpc.New(rpcURL),
	}
}

/*
CheckSOLBalance verifies whether a wallet has enough SOL to perform a transaction.

Arguments:
  - ctx (context.Context): The context for managing request lifetime and cancellation.
  - walletID (string): The Base58-encoded public key of the wallet to check.
  - requiredAmount (float64): The minimum amount of SOL required for the operation.

Returns:
  - (bool): True if the wallet has sufficient SOL, false otherwise.
  - (error): Error if the wallet ID is invalid or the RPC request fails.
*/
func (c *SolanaClient) CheckSOLBalance(ctx context.Context, walletID string, requiredAmount float64) (bool, error) {
	pk, err := solana.PublicKeyFromBase58(walletID)
	if err != nil {
		return false, fmt.Errorf("invalid wallet ID format: %w", err)
	}

	resp, err := c.rpcClient.GetBalance(ctx, pk, rpc.CommitmentFinalized)
	if err != nil {
		return false, fmt.Errorf("failed to fetch balance from RPC: %w", err)
	}

	currentSOL := float64(resp.Value) / float64(solana.LAMPORTS_PER_SOL)

	if currentSOL < requiredAmount {
		log.Printf("Wallet %s balance (%.4f SOL) is insufficient (Required: %.2f SOL)", walletID, currentSOL, requiredAmount)
		return false, nil
	}

	return true, nil
}

/*
ConvertSOLToUSDC performs a token swap transaction from SOL to USDC.

Arguments:
  - ctx (context.Context): Context for managing timeout and cancellation.
  - walletPublicKey (string): Public key of the wallet initiating the conversion.
  - solAmount (float64): The amount of SOL to convert to USDC.

Returns:
  - (*model.ConversionDetails): Struct containing the wallet ID, USDC received,
    transaction ID, and related vault details.
  - (error): Error if conversion fails or the server private key is missing.

Notes:
  - The private key used for signing is securely retrieved from environment variables.
*/
func (c *SolanaClient) ConvertSOLToUSDC(ctx context.Context, walletPublicKey string, solAmount float64) (*model.ConversionDetails, error) {
	walletPrivateKey := os.Getenv("SERVER_PRIVATE_KEY")
	if walletPrivateKey == "" {
		return nil, fmt.Errorf("server signing private key is not configured")
	}

	txID, usdcReceived, err := performConversionSwap(ctx, c.rpcClient, walletPublicKey, walletPrivateKey, solAmount)
	if err != nil {
		return nil, err
	}

	return &model.ConversionDetails{
		WalletID:      walletPublicKey,
		ConvertedUSDC: usdcReceived,
		TransactionID: txID,
		VaultDetails:  "KAMINO_SOL_USDC_VAULT_ID_ABC123",
	}, nil
}
