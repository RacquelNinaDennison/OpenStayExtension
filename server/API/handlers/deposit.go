package handlers

import (
	"encoding/json"
	"net/http"
	"log"
)


func MakeDeposit(w http.ResponseWriter, r *http.Request) {

	
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req DepositRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.WalletID == "" {
		http.Error(w, "walletId is required", http.StatusBadRequest)
		return
	}
	if req.Amount <= 0 {
		http.Error(w, "amount must be greater than 0", http.StatusBadRequest)
		return
	}

	// TODO: Logic to connect to Kamino vault
    log.Printf("Received deposit of %.2f for wallet %s", req.Amount, req.WalletID)
	response := DepositResponse{
		WalletID:      req.WalletID,
		DepositAmount: req.Amount,
		NewBalance:    0,
		Message:       "Deposit successful",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
