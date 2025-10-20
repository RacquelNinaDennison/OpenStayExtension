package api

import (
	"OpenStay/config"
	"OpenStay/pkg/model"
	"OpenStay/pkg/service"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"github.com/gagliardetto/solana-go"
)

func SetupRoutes(cfg *config.Config) *http.ServeMux {
	mux := http.NewServeMux()

	vaultSvc := service.NewVaultService(cfg)

	mux.HandleFunc("/convert-and-deposit", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req model.ConvertAndDepositRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
			return
		}
		walletPriv, err := solana.PrivateKeyFromSolanaKeygenFile(os.Getenv("PRIVATE_KEY_PATH"))
		if err != nil {
			log.Fatal("failed to read private key:", err)
		}
		userUSDC := solana.MustPublicKeyFromBase58(req.WalletID)

		usdcAmount := MockSwap(req.Amount)
		swapSig := "MOCK_SWAP_TX_SIG"

		depositSig, err := vaultSvc.DepositUSDC(walletPriv, userUSDC, usdcAmount)
		if err != nil {
			http.Error(w, "Vault deposit failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		resp := model.TransactionResponse{
			SwapTxSig:    swapSig,
			DepositTxSig: depositSig,
			Message:      "Swap (mocked) and vault deposit completed successfully on Devnet",
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	return mux
}

func MockSwap(amountSOL float64) uint64 {
	return uint64(amountSOL * 90 * 1e6) // 1 SOL = 90 USDC for testing
}
