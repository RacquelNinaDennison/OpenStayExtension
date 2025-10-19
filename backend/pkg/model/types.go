package model

type ConvertAndDepositRequest struct {
	WalletID string  `json:"wallet_id"`
	Amount   float64 `json:"amount"`
}

type TransactionResponse struct {
	SwapTxSig    string `json:"swap_tx_sig"`
	DepositTxSig string `json:"deposit_tx_sig"`
	Message      string `json:"message"`
}
