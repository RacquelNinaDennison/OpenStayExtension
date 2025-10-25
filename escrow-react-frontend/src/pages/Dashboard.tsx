import { API, connection } from "../lib/solana";

export default function Dashboard({ wallet }: { wallet: string | null }) {
  const items: any[] = JSON.parse(localStorage.getItem("bookings") || "[]")
    .filter((x: any) => x.initializer === wallet);

  async function release(rec: any) {
    try {
      const resp = await fetch(`${API}/release`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          initializer: rec.initializer,
          beneficiary: rec.beneficiary,
          releaseTs: rec.releaseTs,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const { signature } = await resp.json();
      await connection.confirmTransaction(signature, "confirmed");
      alert("Released! " + signature.slice(0, 8) + "…");
    } catch (e:any) {
      alert("Release failed: " + (e.message || e));
    }
  }

  return (
    <div className="card">
      <h2>Your Escrows</h2>
      {!wallet && <div className="muted">Connect wallet to view.</div>}
      {wallet && items.length === 0 && <div className="muted">No active escrows.</div>}
      {wallet && items.map((r) => (
        <div key={r.id} className="row space list-item">
          <div>
            <div><strong>{r.listingId}</strong> — ${r.totalUi} USDC</div>
            <div className="muted">Releases: {new Date(r.releaseTs*1000).toLocaleString()}</div>
          </div>
          <button className="btn btn-accent" onClick={() => release(r)}>Release</button>
        </div>
      ))}
    </div>
  );
}
