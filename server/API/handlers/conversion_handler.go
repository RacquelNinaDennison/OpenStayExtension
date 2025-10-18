package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"solana-converter/pkg/model"
	"solana-converter/pkg/service"
)

/*
ConversionHandler encapsulates the dependencies and logic for handling
SOL to USDC conversion requests.

Attributes:
  - Service (service.SolanaClientInterface): The Solana client interface
    used for balance checks and swap operations.
*/
type ConversionHandler struct {
	Service service.SolanaClientInterface
}

/*
NewConversionHandler initializes and returns a new ConversionHandler instance.

Arguments:
  - svc (service.SolanaClientInterface): The Solana service implementation
    used to process conversion requests.

Returns:
  - *ConversionHandler: A configured handler ready to register HTTP endpoints.
*/
func NewConversionHandler(svc service.SolanaClientInterface) *ConversionHandler {
	return &ConversionHandler{Service: svc}
}

/*
ConvertSOLToUSDC handles POST requests that perform the following steps:
 1. Validates the incoming request payload for wallet ID and SOL amount.
 2. Checks if the specified wallet has enough SOL for the transaction.
 3. Initiates a conversion from SOL to USDC via the Solana client service.
 4. Returns structured JSON responses for success or error outcomes.

Expected Request Body (JSON):

	{
	  "wallet_id": "Base58WalletAddress",
	  "amount_sol": 0.5
	}

Arguments:
  - w (http.ResponseWriter): HTTP response writer used to send the response.
  - r (*http.Request): HTTP request object containing the JSON payload.

Returns:
  - Writes a JSON response with:
  - (200 OK) on successful conversion
  - (400/405/500) on validation, method, or processing errors
*/
func (h *ConversionHandler) ConvertSOLToUSDC(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req model.WalletRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request format", http.StatusBadRequest)
		return
	}

	if req.WalletID == "" {
		writeJSONError(w, "Wallet ID is required", http.StatusBadRequest)
		return
	}

	if req.AmountSOL <= 0 {
		writeJSONError(w, "A positive SOL amount to convert ('amount_sol' field) is required", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	amountToConvert := req.AmountSOL

	isSufficient, err := h.Service.CheckSOLBalance(ctx, req.WalletID, amountToConvert)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("Wallet check failed due to network error: %v", err), http.StatusInternalServerError)
		return
	}
	if !isSufficient {
		writeJSONError(w, fmt.Sprintf("Insufficient SOL balance. Required: %.2f SOL", amountToConvert), http.StatusBadRequest)
		return
	}

	conversionDetails, err := h.Service.ConvertSOLToUSDC(ctx, req.WalletID, amountToConvert)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("SOL to USDC conversion failed: %v", err), http.StatusInternalServerError)
		return
	}

	writeJSONResponse(w, conversionDetails, http.StatusOK)
}

/*
writeJSONResponse encodes a given data object into JSON and writes it
to the HTTP response with the provided status code.

Arguments:
  - w (http.ResponseWriter): Response writer for sending data to the client.
  - data (interface{}): The response payload to encode as JSON.
  - statusCode (int): HTTP status code to include in the response.

Returns:
  - None explicitly. Writes JSON output to the HTTP response stream.
*/
func writeJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

/*
writeJSONError constructs and writes a standardized JSON error response.

Arguments:
  - w (http.ResponseWriter): Response writer for sending the error message.
  - message (string): Human-readable error message.
  - statusCode (int): HTTP status code representing the type of error.

Returns:
  - None explicitly. Writes JSON-formatted error details to the response stream.

Response Format (JSON):

	{
	  "error": "Detailed error message",
	  "code": 400
	}
*/
func writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	response := model.ErrorResponse{
		Error: message,
		Code:  statusCode,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(response) // Ignore encode error for error response
}
