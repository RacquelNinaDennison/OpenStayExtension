import { Connection, PublicKey, Transaction } from "@solana/web3.js";

export const API  = import.meta.env.VITE_ESCROW_API as string;
export const RPC  = import.meta.env.VITE_SOLANA_RPC as string;
export const USDC_DECIMALS = Number(import.meta.env.VITE_USDC_DECIMALS || 6);

const ws = RPC.startsWith("https://")
  ? RPC.replace("https://", "wss://")
  : RPC.replace("http://", "ws://");

export const connection = new Connection(RPC, {
  commitment: "confirmed",
  wsEndpoint: ws,       
});

export type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  isConnected?: boolean;
  connect: () => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction?: (tx: Transaction) => Promise<{ signature: string }>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  on?: (e:string, cb:(...a:any[])=>void)=>void;
  removeAllListeners?: ()=>void;
};

export function phantom(): SolanaProvider | null {
  const w = window as any;
  return (w?.solana ?? w?.phantom?.solana) ?? null;
}

export async function connectPhantom(): Promise<string> {
  const p = phantom();
  if (!p?.isPhantom) throw new Error("Phantom not found");
  const { publicKey } = await p.connect();
  return publicKey.toBase58();
}

export function toDateLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localToUnix(s: string) {
  return Math.floor(new Date(s).getTime() / 1000);
}
export function uiToBase(ui: string, decimals: number) {
  const [i, f = ""] = ui.trim().split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(i || "0") * BigInt(10 ** decimals) + BigInt(frac || "0")).toString();
}

export function b64ToTx(b64: string): Transaction {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return Transaction.from(bytes);
}
