import { useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import "./App.css";

// ---- ENV ----
const API = import.meta.env.VITE_ESCROW_API as string;
const RPC = import.meta.env.VITE_SOLANA_RPC as string;
const USDC_DECIMALS = Number(import.meta.env.VITE_USDC_DECIMALS || 6);

// ---- Types ----
type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  isConnected?: boolean;
  connect: (opts?: any) => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction?: (tx: Transaction) => Promise<{ signature: string }>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeAllListeners?: () => void;
};

// ---- Helpers ----
function toDatetimeLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function datetimeLocalToUnixSeconds(s: string) {
  return Math.floor(new Date(s).getTime() / 1000);
}
function uiToBase(ui: string, decimals: number): string {
  const [i, f = ""] = ui.trim().split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return (
    BigInt(i || "0") * BigInt(10 ** decimals) + BigInt(frac || "0")
  ).toString();
}
// browser-safe base64 → bytes (avoid Node Buffer)
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function truncateAddress(addr: string): string {
  return addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : "";
}

export default function App() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [provider, setProvider] = useState<SolanaProvider | null>(null);

  const [connected, setConnected] = useState(false);
  const [walletPubkey, setWalletPubkey] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [sig, setSig] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [beneficiary, setBeneficiary] = useState("");
  const [amountUi, setAmountUi] = useState("10");
  const [releaseLocal, setReleaseLocal] = useState(
    toDatetimeLocal(new Date(Date.now() + 60_000))
  );

  useEffect(() => {
    setConnection(new Connection(RPC, "confirmed"));

    const w = window as any;
    const p: SolanaProvider = w?.solana ?? w?.phantom?.solana ?? null;

    if (p?.isPhantom) {
      if (p.isConnected && p.publicKey) {
        setConnected(true);
        setWalletPubkey(p.publicKey.toBase58());
        setStatus("Wallet connected successfully");
      } else {
        setStatus("Ready to connect");
      }

      // listeners (optional)
      p.on?.("connect", (pk: any) => {
        setConnected(true);
        setWalletPubkey(pk?.toBase58?.() ?? pk?.publicKey?.toBase58?.() ?? "");
        setStatus("Wallet connected successfully");
      });
      p.on?.("disconnect", () => {
        setConnected(false);
        setWalletPubkey(null);
        setStatus("Wallet disconnected");
      });
      p.on?.("accountChanged", (pk: any) => {
        if (pk) {
          setWalletPubkey(pk.toBase58());
          setStatus("Account changed");
        } else {
          setConnected(false);
          setWalletPubkey(null);
          setStatus("Wallet disconnected");
        }
      });

      setProvider(p);
    } else {
      setStatus("Phantom wallet not detected. Please install Phantom extension.");
    }

    return () => {
      p?.removeAllListeners?.();
    };
  }, []);

  const explorerTx = useMemo(
    () =>
      sig
        ? `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(
            RPC
          )}`
        : "",
    [sig]
  );

  async function connectWallet() {
    try {
      if (!provider?.connect) {
        setStatus(
          "Phantom wallet not found. Please install the extension and refresh."
        );
        return;
      }
      setIsLoading(true);
      setStatus("Requesting wallet connection...");
      const res = await provider.connect();
      setConnected(true);
      setWalletPubkey(res.publicKey.toBase58());
      setStatus("Wallet connected successfully");
    } catch (e: any) {
      if (e?.code === 4001 || e?.message?.includes("User rejected")) {
        setStatus("Connection rejected by user");
      } else {
        setStatus(`Connection failed: ${e?.message || "Unknown error"}`);
      }
      console.error("Connect error:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function disconnectWallet() {
    try {
      await provider?.disconnect?.();
      setConnected(false);
      setWalletPubkey(null);
      setStatus("Wallet disconnected");
    } catch (e) {
      console.error("Disconnect error:", e);
    }
  }

  async function hold() {
    setSig("");
    if (!connected || !walletPubkey) {
      setStatus("Please connect your wallet first");
      return;
    }
    if (!beneficiary) {
      setStatus("Please enter beneficiary address");
      return;
    }

    try {
      setIsLoading(true);
      const initializerPk = new PublicKey(walletPubkey);
      const beneficiaryPk = new PublicKey(beneficiary);
      const amountBase = uiToBase(amountUi, USDC_DECIMALS);
      const releaseTs = datetimeLocalToUnixSeconds(releaseLocal);

      if (releaseTs <= Math.floor(Date.now() / 1000)) {
        setStatus("Release time must be in the future");
        setIsLoading(false);
        return;
      }

      setStatus("Preparing hold transaction...");
      const resp = await fetch(`${API}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initializer: initializerPk.toBase58(),
          beneficiary: beneficiaryPk.toBase58(),
          amount: amountBase,
          releaseTs,
        }),
      });
      if (!resp.ok) throw new Error((await resp.text()) || "API request failed");
      const { tx } = await resp.json();
      const transaction = Transaction.from(b64ToBytes(tx));

      setStatus("Please approve transaction in Phantom...");
      if (provider?.signAndSendTransaction) {
        const { signature } = await provider.signAndSendTransaction(transaction);
        setStatus("Confirming transaction...");
        await connection!.confirmTransaction(signature, "confirmed");
        setSig(signature);
      } else if (provider?.signTransaction) {
        const signed = await provider.signTransaction(transaction);
        setStatus("Sending transaction...");
        const raw = signed.serialize();
        const signature = await connection!.sendRawTransaction(raw);
        await connection!.confirmTransaction(signature, "confirmed");
        setSig(signature);
      } else {
        throw new Error("Wallet does not support transaction signing");
      }

      setStatus("Hold completed successfully! ✅");
    } catch (e: any) {
      if (e?.code === 4001 || e?.message?.includes("User rejected")) {
        setStatus("Transaction rejected by user");
      } else {
        setStatus(`Hold failed: ${e?.message || "Unknown error"}`);
      }
      console.error("Hold error:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function release() {
    setSig("");
    if (!connected || !walletPubkey) {
      setStatus("Please connect your wallet first");
      return;
    }
    if (!beneficiary) {
      setStatus("Please enter beneficiary address");
      return;
    }

    try {
      setIsLoading(true);
      const initializerPk = new PublicKey(walletPubkey);
      const beneficiaryPk = new PublicKey(beneficiary);
      const releaseTs = datetimeLocalToUnixSeconds(releaseLocal);

      setStatus("Sending release request...");
      const resp = await fetch(`${API}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initializer: initializerPk.toBase58(),
          beneficiary: beneficiaryPk.toBase58(),
          releaseTs,
        }),
      });
      if (!resp.ok) throw new Error((await resp.text()) || "API request failed");
      const { signature } = await resp.json();

      setStatus("Confirming transaction...");
      await connection!.confirmTransaction(signature, "confirmed");
      setSig(signature);
      setStatus("Release completed successfully! ✅");
    } catch (e: any) {
      setStatus(`Release failed: ${e?.message || "Unknown error"}`);
      console.error("Release error:", e);
    } finally {
      setIsLoading(false);
    }
  }

  const statusClass =
    status.includes("✅")
      ? "status-message success"
      : status.toLowerCase().includes("failed") ||
        status.toLowerCase().includes("rejected")
      ? "status-message error"
      : "status-message";

  return (
    <div className="container">
      <div className="header">
        <h1>USDC Timelock Escrow</h1>
        <p className="subtitle">Secure time-locked USDC transfers on Solana</p>
      </div>

      <div className="card main-card">
        <div className="wallet-section">
          <div className="wallet-info">
            <span className="label">Wallet Status</span>
            {connected && walletPubkey ? (
              <div className="wallet-badge connected">
                <span className="dot" />
                <span className="address">{truncateAddress(walletPubkey)}</span>
              </div>
            ) : (
              <div className="wallet-badge disconnected">
                <span className="dot" />
                <span>Not Connected</span>
              </div>
            )}
          </div>

          {connected ? (
            <button
              className="btn btn-secondary"
              onClick={disconnectWallet}
              disabled={isLoading}
            >
              Disconnect
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={connectWallet}
              disabled={isLoading}
            >
              {isLoading ? "Connecting..." : "Connect Phantom"}
            </button>
          )}
        </div>

        <div className="divider" />

        <div className="form-section">
          <div className="form-group">
            <label className="form-label">
              <span>Beneficiary Address</span>
              <span className="required">*</span>
            </label>
            <input
              className="input"
              placeholder="Enter Solana wallet address"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                <span>Amount (USDC)</span>
                <span className="required">*</span>
              </label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.000001"
                placeholder="0.00"
                value={amountUi}
                onChange={(e) => setAmountUi(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Release Time</span>
                <span className="required">*</span>
              </label>
              <input
                className="input datetime-input"
                type="datetime-local"
                value={releaseLocal}
                onChange={(e) => setReleaseLocal(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button
            className="btn btn-large btn-primary"
            onClick={hold}
            disabled={!connected || isLoading}
          >
            {isLoading ? "Processing..." : "Initialize Hold"}
          </button>
          <button
            className="btn btn-large btn-accent"
            onClick={release}
            disabled={!connected || isLoading}
          >
            {isLoading ? "Processing..." : "Release Funds"}
          </button>
        </div>

        {status && (
          <div className={statusClass}>
            <div className="status-icon">
              {status.includes("✅") ? "✓" : status.toLowerCase().includes("failed") || status.toLowerCase().includes("rejected") ? "✕" : "ℹ"}
            </div>
            <span>{status}</span>
          </div>
        )}

        {sig && (
          <div className="transaction-link">
            <span className="tx-label">Transaction:</span>
            <a
              className="tx-signature"
              target="_blank"
              rel="noreferrer"
              href={explorerTx}
            >
              {truncateAddress(sig)} →
            </a>
          </div>
        )}
      </div>

      <div className="info-card">
        <h3>How it works</h3>
        <ul>
          <li><strong>Initialize Hold:</strong> Lock USDC with a time-based release condition</li>
          <li><strong>Release Funds:</strong> After the specified time, transfer funds to beneficiary</li>
          <li><strong>Secure:</strong> Funds are held in an on-chain escrow program</li>
        </ul>
        <p className="api-info">
          Backend API: <code className="code-inline">{API}</code>
        </p>
      </div>
    </div>
  );
}
