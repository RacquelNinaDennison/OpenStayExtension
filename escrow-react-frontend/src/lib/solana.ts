import { Connection, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
// make Buffer available
// @ts-ignore
(window as any).Buffer = (window as any).Buffer || Buffer;

export const RPC = import.meta.env.VITE_SOLANA_RPC as string;
export const API = import.meta.env.VITE_ESCROW_API as string;
export const USDC_DECIMALS = Number(import.meta.env.VITE_USDC_DECIMALS || 6);

export const connection = new Connection(RPC, "confirmed");

export function phantom(): any | null {
  const w = window as any;
  return w?.solana ?? w?.phantom?.solana ?? null;
}

export async function connectPhantom(): Promise<string> {
  const p = phantom();
  if (!p?.connect) throw new Error("Phantom not found");
  const res = await p.connect();
  return res.publicKey.toBase58();
}

export function uiToBase(ui: string, decimals: number): string {
  const [i, f = ""] = ui.trim().split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(i || "0") * BigInt(10 ** decimals) + BigInt(frac || "0")).toString();
}

export function b64ToTx(b64: string): Transaction {
  return Transaction.from(Buffer.from(b64, "base64"));
}

export function toDateLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localToUnix(s: string): number {
  return Math.floor(new Date(s).getTime()/1000);
}
