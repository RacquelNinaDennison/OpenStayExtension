import { API } from "./solana";

export async function apiHold(body: {
  initializer: string;
  beneficiary: string;
  amount: string;     // base units string
  releaseTs: number;  // unix
}) {
  const r = await fetch(`${API}/hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ tx: string; lastValidBlockHeight: number }>;
}

export async function apiRelease(body: {
  initializer: string;
  beneficiary: string;
  releaseTs: number;
}) {
  const r = await fetch(`${API}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ signature: string }>;
}
