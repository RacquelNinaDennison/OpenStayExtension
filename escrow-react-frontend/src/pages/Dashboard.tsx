import { useEffect, useMemo, useState } from "react";
import { API, connection } from "../lib/solana";

type Booking = {
  id: string;
  listingId: string;
  initializer: string;
  beneficiary: string;
  totalUi: string;
  releaseTs: number;
};

export default function Dashboard({ wallet }: { wallet: string | null }) {
  const [items, setItems] = useState<Booking[]>([]);

  // refresh every ~1s to keep countdown fresh
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const all: Booking[] = JSON.parse(localStorage.getItem("bookings") || "[]");
    setItems(all.filter((x) => x.initializer === wallet));
  }, [wallet]);

  const now = Math.floor(Date.now() / 1000);

  function formatCountdown(target: number) {
    const delta = Math.max(0, target - now);
    const d = Math.floor(delta / 86400);
    const h = Math.floor((delta % 86400) / 3600);
    const m = Math.floor((delta % 3600) / 60);
    const s = delta % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  async function release(rec: Booking) {
    try {
      const resp = await fetch(`${API}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initializer: rec.initializer,
          beneficiary: rec.beneficiary,
          releaseTs: rec.releaseTs,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const { signature } = await resp.json();
      await connection.confirmTransaction(signature, "confirmed");

      alert(`Released! ${signature.slice(0, 8)}…`);
      // remove released item locally (optional)
      const next = items.filter((x) => x.id !== rec.id);
      setItems(next);
      const all: Booking[] = JSON.parse(localStorage.getItem("bookings") || "[]");
      localStorage.setItem("bookings", JSON.stringify(all.filter((x) => x.id !== rec.id)));
    } catch (e: any) {
      alert("Release failed: " + (e.message || e));
    }
  }

  const body = useMemo(() => {
    if (!wallet) return <div className="muted">Connect wallet to view.</div>;
    if (items.length === 0)
      return (
        <div className="empty-state">
          <div className="empty-title">No active escrows</div>
          <div className="empty-sub">Holds you create will appear here.</div>
        </div>
      );

    return (
      <div className="escrow-list">
        {items.map((r) => {
          const releasable = now >= r.releaseTs;
          const countdown = formatCountdown(r.releaseTs);
          return (
            <div key={r.id} className="escrow-item">
              <div className="escrow-main">
                <div className="pill-id">#{r.listingId}</div>
                <div className="amount">${Number(r.totalUi).toFixed(2)} USDC</div>
              </div>

              <div className="escrow-meta">
                <div className="meta-row">
                  <span className="meta-label">Releases</span>
                  <span className="meta-value">
                    {new Date(r.releaseTs * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Status</span>
                  <span className={`badge ${releasable ? "ok" : "wait"}`}>
                    {releasable ? "Ready to release" : `Unlocks in ${countdown}`}
                  </span>
                </div>
              </div>

              <div className="escrow-actions">
                <button
                  className="btn btn-accent wide"
                  onClick={() => release(r)}
                  disabled={!releasable}
                  aria-disabled={!releasable}
                  title={releasable ? "Release funds" : "Not yet unlockable"}
                >
                  Release
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [items, wallet, now]);

  return (
    <div className="dash-card">
      <div className="dash-header">
        <h2 className="dash-title">Your Escrows</h2>
        <p className="dash-sub">Track holds and release funds when the time arrives.</p>
      </div>
      {body}
    </div>
  );
}
