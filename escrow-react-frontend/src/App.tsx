import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import Listings from "./pages/Listings";
import ListingDetail from "./pages/ListingDetail";
import Checkout from "./pages/Checkout";
import Dashboard from "./pages/Dashboard";
import Landing from "./pages/Landing";
import GetStarted from "./pages/GetStarted";
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
      {/* topbar kept as-is, but update the brand to go home */}
      <div className="topbar">
        <div className="topbar-wrap">
          <div className="brand" onClick={() => nav("/")}> {/* go to Landing */}
            {/* logo svg */}
            <span>OpenStay</span>
          </div>

          {/* search stays sends to /listings */}
          <div className="searchbar">
            <input placeholder="Search destinations, dates, guests…" />
            <button className="btn btn-ghost" onClick={() => nav("/listings")}>Search</button>
          </div>

          <div className="nav-actions">
            <NavLink to="/dashboard" className="toplink">Dashboard</NavLink>
            <button className="btn btn-secondary" onClick={connect}>
              {wallet ? `Connected: ${wallet.slice(0, 4)}...${wallet.slice(-4)}`
                      : "Connect Phantom"}
            </button>
          </div>
        </div>
      </div>

      <div className="subnav">
        <div className="subnav-wrap">
          <NavLink className={({isActive}) => `pill ${isActive ? "active":""}`} to="/listings">
            Listings
          </NavLink>
          <NavLink className={({isActive}) => `pill ${isActive ? "active":""}`} to="/dashboard">
            Your Escrows
          </NavLink>
        </div>
      </div>

      <main className="container">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/get-started" element={<GetStarted />} />
          <Route path="/listings" element={<Listings />} />
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
