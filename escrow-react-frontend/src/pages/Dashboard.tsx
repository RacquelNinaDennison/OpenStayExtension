import { useEffect, useState } from "react";
import { API, connection } from "../lib/solana";

type Booking = {
  id: string;
  listingId: string;
  initializer: string;
  beneficiary: string;
  totalUi: string;
  releaseTs: number;
};

type Props = { wallet: string | null };

export default function Dashboard({ wallet }: Props) {
  const [items, setItems] = useState<Booking[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const data: Booking[] = JSON.parse(localStorage.getItem("bookings") || "[]");
    setItems(data);
  }, []);

  async function release(b: Booking) {
    try {
      setStatus("Releasing...");
      const resp = await fetch(`${API}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initializer: b.initializer,
          beneficiary: b.beneficiary,
          releaseTs: b.releaseTs,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const { signature } = await resp.json();
      await connection.confirmTransaction(signature, "confirmed");
      setStatus(`Released ${signature}`);

      const next = items.filter((x) => x.id !== b.id);
      setItems(next);
      localStorage.setItem("bookings", JSON.stringify(next));
    } catch (e: any) {
      setStatus(`Release failed: ${e.message || e}`);
      console.error(e);
    }
  }

  return (
    <div className="card main-card">
      <div className="row" style={{marginBottom:8}}>
        <h2 className="h2">Your Escrows</h2>
        {wallet && <span className="mute">Wallet: {wallet.slice(0,6)}…{wallet.slice(-4)}</span>}
      </div>

      {items.length === 0 && (
        <div className="card pad-lg" style={{marginTop:12}}>
          <p className="mute">No active escrows yet.</p>
        </div>
      )}

      <div className="section" style={{display:"grid", gap:16}}>
        {items.map((b) => (
          <div key={b.id} className="card pad-lg">
            <div className="kv"><strong>Booking</strong><span>{b.listingId}</span></div>
            <div className="kv"><strong>Total</strong><span>${b.totalUi} USDC</span></div>
            <div className="kv"><strong>Beneficiary</strong><span>{b.beneficiary.slice(0,6)}...{b.beneficiary.slice(-4)}</span></div>
            <div className="kv">
              <strong>Release Time</strong>
              <span>{new Date(b.releaseTs*1000).toLocaleString()}</span>
            </div>
            <button className="btn btn-accent" onClick={() => release(b)} style={{marginTop:12}}>
              Release to Host
            </button>
          </div>
        ))}
      </div>

      {status && (
        <div className={`status ${status.includes("failed") ? "err" : "ok"}`}>
          {status}
        </div>
      )}
    </div>
  );
}
