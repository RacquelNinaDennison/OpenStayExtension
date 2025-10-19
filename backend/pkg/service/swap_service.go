package service

import (
	"OpenStay/config"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

type SwapService struct {
	cfg    *config.Config
	client *rpc.Client
}

func NewSwapService(cfg *config.Config) *SwapService {
	return &SwapService{
		cfg:    cfg,
		client: rpc.New(cfg.RpcURL),
	}
}

func (s *SwapService) SwapSOLToUSDC(amountLamports uint64, user solana.PrivateKey) (string, error) {
	ctx := context.Background()

	quoteURL := fmt.Sprintf(
		"%s/quote?inputMint=%s&outputMint=%s&amount=%d&slippageBps=50",
		s.cfg.JupiterAPI,
		s.cfg.SolMint,
		s.cfg.UsdcMint,
		amountLamports,
	)

	res, err := http.Get(quoteURL)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	var quote map[string]interface{}
	if err := json.Unmarshal(body, &quote); err != nil {
		return "", err
	}

	routes, ok := quote["data"].([]interface{})
	if !ok || len(routes) == 0 {
		return "", fmt.Errorf("no swap route found")
	}

	swapRoute := routes[0].(map[string]interface{})
	txBase64 := swapRoute["swapTransaction"].(string)

	tx, err := solana.TransactionFromBase64(txBase64)
	if err != nil {
		return "", fmt.Errorf("failed to deserialize tx: %w", err)
	}

	tx.Sign(func(pubKey solana.PublicKey) *solana.PrivateKey {
		if pubKey.Equals(user.PublicKey()) {
			return &user
		}
		return nil
	})

	sig, err := s.client.SendTransaction(ctx, tx)
	if err != nil {
		return "", err
	}

	return sig.String(), nil
}
