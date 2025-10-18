package handlers

type DepositRequest struct {
	WalletID string  `json:"walletId"`
	Amount   float64 `json:"amount"`
}

type DepositResponse struct {
	WalletID      string  `json:"walletId"`
	DepositAmount float64 `json:"depositAmount"`
	NewBalance    float64 `json:"newBalance"`
	Message       string  `json:"message"`
}