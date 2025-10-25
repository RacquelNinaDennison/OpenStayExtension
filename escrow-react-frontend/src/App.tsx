import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import Listings from "./pages/Listings";
import ListingDetail from "./pages/ListingDetail";
import Checkout from "./pages/Checkout";
import Dashboard from "./pages/Dashboard";
import { useEffect, useState } from "react";
import { connectPhantom, phantom } from "./lib/solana";
import "./index.css";

export default function App() {
  const [wallet, setWallet] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    const p = phantom();
    if (p?.isPhantom && p.publicKey) setWallet(p.publicKey.toBase58());
    p?.on?.("accountChanged", (pk:any) => setWallet(pk?.toBase58?.() ?? null));
    p?.on?.("disconnect", () => setWallet(null));
    return () => p?.removeAllListeners?.();
  }, []);

  async function connect() {
    try {
      const pk = await connectPhantom();
      setWallet(pk);
    } catch (e) {
      console.error(e);
      alert("Failed to connect Phantom.");
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="topbar-wrap">
          <div className="brand" onClick={() => nav("/")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7-6.2-3.3L5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>
            <span>OpenStay</span>
          </div>
          <div className="searchbar">
            <input placeholder="Search destinations, dates, guests…" />
            <button className="btn btn-ghost">Search</button>
          </div>
          <div className="nav-actions">
            <NavLink to="/dashboard" className="toplink">Dashboard</NavLink>
            <button className="btn btn-secondary" onClick={connect}>
              {wallet ? `Connected: ${wallet.slice(0,4)}...${wallet.slice(-4)}` : "Connect Phantom"}
            </button>
          </div>
        </div>
      </div>

      <div className="subnav">
        <div className="subnav-wrap">
          <NavLink className={({isActive})=>`pill ${isActive?'active':''}`} to="/" end>Listings</NavLink>
          <NavLink className={({isActive})=>`pill ${isActive?'active':''}`} to="/dashboard">Your Escrows</NavLink>
        </div>
      </div>

      <main className="container">
        <Routes>
          <Route path="/" element={<Listings />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          <Route path="/checkout/:id" element={<Checkout wallet={wallet} />} />
          <Route path="/dashboard" element={<Dashboard wallet={wallet} />} />
          <Route path="*" element={<div className="card p-xl">Not found</div>} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="container">© {new Date().getFullYear()} OpenStay</div>
      </footer>
    </div>
  );
}
