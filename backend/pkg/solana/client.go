package solana

import (
	"context"
	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

func NewClient(rpcURL string) *rpc.Client {
	return rpc.New(rpcURL)
}

func GetBalance(ctx context.Context, client *rpc.Client, pubKey string) (uint64, error) {
	accountPubKey := solana.MustPublicKeyFromBase58(pubKey)
	account, err := client.GetBalance(ctx, accountPubKey, rpc.CommitmentConfirmed)
	if err != nil {
		return 0, err
	}
	return account.Value, nil
}
