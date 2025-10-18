package main

import (
	"log"
	"net/http"
	"api/handlers" 
)

func main() {
	/*
		Request structure: {WalletID string,  Amount float64 }
		Response structure: {WalletID string, DepositAmount float64, NewBalance float64, Message string `}
	*/
	http.HandleFunc("/api/v1/deposit", handlers.MakeDeposit)
	log.Println("Server started on port 8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}