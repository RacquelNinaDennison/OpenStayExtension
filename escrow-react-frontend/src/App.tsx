import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import Listings from "./pages/Listings";
import ListingDetail from "./pages/ListingDetail";
import Checkout from "./pages/Checkout";
import Dashboard from "./pages/Dashboard";
import { useEffect, useState } from "react";
import { connectPhantom, phantom } from "./lib/solana";
import "./index.css";

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  isConnected?: boolean;
  connect?: (opts?: any) => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?: () => Promise<void>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeAllListeners?: () => void;
};

export default function App() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const nav = useNavigate();

  useEffect(() => {
    const p: SolanaProvider | null = phantom();

    if (!p?.isPhantom) {
      setStatus("Phantom not detected");
      return;
    }

    // Attempt silent restore if user already trusted the site
    p.connect?.({ onlyIfTrusted: true }).then((res) => {
      const pk = res?.publicKey?.toBase58?.();
      if (pk) {
        setWallet(pk);
        setStatus("Wallet restored");
      }
    }).catch(() => { /* ignore */ });

    // Wire listeners so app state always mirrors Phantom (initializer = connected wallet)
    p.on?.("connect", (arg: any) => {
      const pk =
        arg?.toBase58?.() ??
        arg?.publicKey?.toBase58?.() ??
        p.publicKey?.toBase58?.() ??
        null;
      if (pk) setWallet(pk);
      setStatus("Wallet connected");
    });

    p.on?.("disconnect", () => {
      setWallet(null);
      setStatus("Wallet disconnected");
    });

    p.on?.("accountChanged", (newPk: any) => {
      if (newPk && typeof newPk.toBase58 === "function") {
        setWallet(newPk.toBase58());
        setStatus("Account changed");
      } else {
        setWallet(null);
        setStatus("Wallet disconnected");
      }
    });

    return () => p.removeAllListeners?.();
  }, []);

  async function connect() {
    try {
      const pk = await connectPhantom(); // should call provider.connect() under the hood
      if (pk) {
        setWallet(pk);
        setStatus("Wallet connected");
      }
    } catch (e: any) {
      setStatus(e?.message || "Failed to connect");
      console.error(e);
    }
  }

  async function disconnect() {
    try {
      const p = phantom();
      await p?.disconnect?.();
      setWallet(null);
      setStatus("Wallet disconnected");
    } catch (e) {
      console.error(e);
    }
  }

  const connected = !!wallet;

  return (
    <div className="app-shell">
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-wrap">
          <div className="brand" onClick={() => nav("/")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 7-6.2-3.3L5.8 21l1.2-6.8-5-4.9 6.9-1z" />
            </svg>
            <span>OpenStay</span>
          </div>

          <div className="searchbar">
            <input placeholder="Search destinations, dates, guests…" />
            <button className="btn btn-ghost">Search</button>
          </div>

          <div className="nav-actions">
            <NavLink to="/dashboard" className="toplink">
              Dashboard
            </NavLink>

            {connected ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="toplink">
                  {`Connected: ${wallet!.slice(0, 4)}...${wallet!.slice(-4)}`}
                </span>
                <button className="btn btn-secondary" onClick={disconnect}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={connect}>
                Connect Phantom
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Subnav */}
      <div className="subnav">
        <div className="subnav-wrap">
          <NavLink className={({ isActive }) => `pill ${isActive ? "active" : ""}`} to="/" end>
            Listings
          </NavLink>
          <NavLink className={({ isActive }) => `pill ${isActive ? "active" : ""}`} to="/dashboard">
            Your Escrows
          </NavLink>
        </div>
      </div>

      {/* Main content */}
      <main className="container">
        {/* Optional tiny status line */}
        {status && (
          <div style={{ marginBottom: 12, color: "#64748b", fontSize: 14 }}>
            {status}
          </div>
        )}

        <Routes>
          <Route path="/" element={<Listings />} />
          <Route path="/listing/:id" element={<ListingDetail />} />
          {/* Pass the *always-in-sync* Phantom wallet to pages that build/sign escrow */}
          <Route path="/checkout/:id" element={<Checkout wallet={wallet} />} />
          <Route path="/dashboard" element={<Dashboard wallet={wallet} />} />
          <Route path="*" element={<div className="card p-xl">Not found</div>} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="container">
          <span>© {new Date().getFullYear()} OpenStay</span>
        </div>
      </footer>
    </div>
  );
}
