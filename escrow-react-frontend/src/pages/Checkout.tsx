import { useParams, useNavigate } from "react-router-dom";
import { LISTINGS } from "../data/listings";
import { API, USDC_DECIMALS, b64ToTx, connection, localToUnix, toDateLocalInput, uiToBase, phantom } from "../lib/solana";
import { useMemo, useState } from "react";

type Props = { wallet: string | null };

export default function Checkout({ wallet }: Props) {
  const { id } = useParams();
  const nav = useNavigate();
  const l = LISTINGS.find((x) => x.id === id);
  const [checkIn, setCheckIn] = useState(toDateLocalInput(new Date()));
  const [checkOut, setCheckOut] = useState(toDateLocalInput(new Date(Date.now()+24*3600*1000)));
  const [status, setStatus] = useState("");

  const nights = useMemo(() => {
    const a = new Date(checkIn).getTime();
    const b = new Date(checkOut).getTime();
    return Math.max(1, Math.ceil((b-a)/(24*3600*1000)));
  }, [checkIn, checkOut]);

  if (!l) return <div className="card pad-lg">Listing not found</div>;

  const totalUi = (l.pricePerNight * nights).toFixed(2);

  async function placeHold() {
    try {
      if (!wallet) { setStatus("Connect wallet first."); return; }
      const releaseTs = localToUnix(checkOut);
      const amount = uiToBase(totalUi, USDC_DECIMALS);

      setStatus("Preparing escrow tx…");
      const resp = await fetch(`${API}/hold`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          initializer: wallet,
          beneficiary: l.hostAddress,
          amount,
          releaseTs
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const { tx } = await resp.json();

      const transaction = b64ToTx(tx);
      const p = phantom();
      if (p?.signAndSendTransaction) {
        const { signature } = await p.signAndSendTransaction(transaction);
        await connection.confirmTransaction(signature, "confirmed");
      } else if (p?.signTransaction) {
        const signed = await p.signTransaction(transaction);
        const raw = signed.serialize();
        const sig = await connection.sendRawTransaction(raw);
        await connection.confirmTransaction(sig, "confirmed");
      } else {
        throw new Error("Wallet cannot sign transactions");
      }

      const rec = {
        id: `${l.id}-${releaseTs}`,
        listingId: l.id,
        initializer: wallet,
        beneficiary: l.hostAddress,
        totalUi,
        releaseTs
      };
      const past = JSON.parse(localStorage.getItem("bookings") || "[]");
      localStorage.setItem("bookings", JSON.stringify([...past, rec]));

      setStatus("Escrow created Redirecting to Dashboard…");
      nav("/dashboard");
    } catch (e:any) {
      setStatus(`Hold failed: ${e.message || e}`);
      console.error(e);
    }
  }

  return (
    <div className="card main-card">
      <div className="row" style={{marginBottom:8}}>
        <h2 className="h2">Confirm your stay</h2>
        <span className="mute">{l.title} — {l.location}</span>
      </div>

      <div className="section" style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:24}}>
        {/* form */}
        <div className="card pad-lg">
          <div className="row" style={{gap:16}}>
            <div style={{flex:1}}>
              <label className="label">Check-in</label>
              <input className="input" type="datetime-local" value={checkIn} onChange={e=>setCheckIn(e.target.value)}/>
            </div>
            <div style={{flex:1}}>
              <label className="label">Check-out</label>
              <input className="input" type="datetime-local" value={checkOut} onChange={e=>setCheckOut(e.target.value)}/>
            </div>
          </div>

          <div className="kv" style={{marginTop:14}}>
            <strong>Nights</strong><span>{nights}</span>
          </div>
          <div className="kv" style={{marginTop:6}}>
            <strong>Total</strong><span>${totalUi} USDC</span>
          </div>

          <button className="btn btn-primary" onClick={placeHold} style={{marginTop:16}}>
            Hold ${totalUi} in Escrow
          </button>

          {status && (
            <div className={`status ${status.includes("failed") ? "err" : "ok"}`} style={{marginTop:12}}>
              {status}
            </div>
          )}
        </div>

        {/* sticky summary */}
        <aside className="sticky-book">
          <div className="photo" style={{marginBottom:12}}>
            <img src={l.image} alt={l.title}/>
          </div>
          <div className="kv"><strong>Listing</strong><span>{l.id}</span></div>
          <div className="kv"><strong>Price / night</strong><span>${l.pricePerNight}</span></div>
          <div className="kv"><strong>Nights</strong><span>{nights}</span></div>
          <hr style={{border:'none', borderTop:'1px solid #eef2f7', margin:'12px 0'}}/>
          <div className="kv"><strong>Total</strong><span>${totalUi} USDC</span></div>
        </aside>
      </div>
    </div>
  );
}
