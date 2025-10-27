import { useParams, useNavigate } from "react-router-dom";
import { LISTINGS } from "../data/listings";
import {
  API, USDC_DECIMALS, b64ToTx, connection,
  localToUnix, toDateLocalInput, uiToBase, phantom
} from "../lib/solana";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useEffect, useMemo, useState } from "react";

export default function Checkout({ wallet }: { wallet: string | null }) {
  const { id } = useParams();
  const nav = useNavigate();
  const l = LISTINGS.find((x) => x.id === id);

  const [checkIn, setCheckIn] = useState(toDateLocalInput(new Date()));
  const [checkOut, setCheckOut] = useState(
    toDateLocalInput(new Date(Date.now() + 24 * 3600 * 1000))
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  // ==== Phantom provider lifecycle logs ====
  useEffect(() => {
    const p = phantom();
    if (!p) {
      console.warn("[PHANTOM] no provider detected");
      return;
    }
    console.log("[PHANTOM] detected", {
      isPhantom: p.isPhantom,
      isConnected: p.isConnected,
      hasSignAndSend: !!p.signAndSendTransaction,
      hasSignTx: !!p.signTransaction,
    });

    const onConnect = (pk: any) => {
      const base58 =
        pk?.toBase58?.() ?? pk?.publicKey?.toBase58?.() ?? String(pk);
      console.log("[PHANTOM:event] connect", base58);
    };
    const onDisconnect = () => console.log("[PHANTOM:event] disconnect");
    const onAccountChanged = (pk: any) => {
      const v = pk ? (pk.toBase58 ? pk.toBase58() : String(pk)) : null;
      console.log("[PHANTOM:event] accountChanged", v);
    };

    p.on?.("connect", onConnect);
    p.on?.("disconnect", onDisconnect);
    p.on?.("accountChanged", onAccountChanged);

    return () => {
      p.removeAllListeners?.();
    };
  }, []);

  const nights = useMemo(() => {
    const a = new Date(checkIn).getTime();
    const b = new Date(checkOut).getTime();
    return Math.max(1, Math.ceil((b - a) / (24 * 3600 * 1000)));
  }, [checkIn, checkOut]);

  if (!l) return <div className="card">Listing not found</div>;

  const totalUi = (l.pricePerNight * nights).toFixed(2);

  function assertPubkey(label: string, v: string) {
    try {
      return new PublicKey(v);
    } catch {
      throw new Error(`${label} is not a valid Solana address`);
    }
  }

  function logTxSummary(tx: Transaction, tag = "TX") {
    const ixCount = tx.instructions.length;
    const accounts = new Set<string>();
    tx.instructions.forEach((ix, idx) => {
      ix.keys.forEach((k) => accounts.add(k.pubkey.toBase58()));
      console.log(`[${tag}] ix#${idx} program=${ix.programId.toBase58()} keys=${ix.keys.length} dataLen=${ix.data?.length ?? 0}`);
    });
    console.log(
      `[${tag}] summary`,
      {
        feePayer: tx.feePayer?.toBase58(),
        recentBlockhash: tx.recentBlockhash,
        instructions: ixCount,
        uniqueAccounts: accounts.size,
      }
    );
  }

  async function placeHold() {
    try {
      if (!wallet) {
        setStatus("Connect wallet first.");
        return;
      }
      setBusy(true);
      setStatus("Validating…");

      const initializerPk = assertPubkey("Initializer", wallet);
      const beneficiaryPk = assertPubkey("Beneficiary", l.hostAddress);
      const releaseTs = localToUnix(checkOut); // seconds
      const amount = uiToBase(totalUi, USDC_DECIMALS); // base units string

      if (releaseTs <= Math.floor(Date.now() / 1000)) {
        throw new Error("Release time must be in the future");
      }

      // ====== CALL SERVER /hold with logs ======
      const body = {
        initializer: initializerPk.toBase58(),
        beneficiary: beneficiaryPk.toBase58(),
        amount,
        releaseTs,
      };

      console.groupCollapsed("[API] POST /hold → request");
      console.log("url:", `${API}/hold`);
      console.log("body:", body);
      console.groupEnd();

      setStatus("Preparing escrow transaction…");
      const t0 = performance.now();
      const resp = await fetch(`${API}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const t1 = performance.now();

      console.groupCollapsed("[API] /hold → response meta");
      console.log("status:", resp.status, resp.statusText);
      console.log("durationMs:", Math.round(t1 - t0));
      console.log("headers:", Object.fromEntries(resp.headers.entries()));
      console.groupEnd();

      if (!resp.ok) {
        let serverMsg = "";
        try {
          const j = await resp.json();
          serverMsg = j?.error || JSON.stringify(j);
        } catch {
          serverMsg = await resp.text();
        }
        console.error("[API] /hold → error payload:", serverMsg);
        throw new Error(serverMsg || "API request failed");
      }

      const json = await resp.json();
      console.groupCollapsed("[API] /hold → response body");
      console.log(json);
      console.groupEnd();

      const { tx: base64Tx } = json;
      const txBytes = atob(base64Tx).length;
      console.log("[CLIENT] base64 tx length (bytes):", txBytes);

      const transaction = b64ToTx(base64Tx);
      logTxSummary(transaction, "CLIENT");

      // ====== PHANTOM FLOW with logs ======
      const p = phantom();
      if (!p) throw new Error("Phantom not found");

      setStatus("Please approve in Phantom…");
      if (p.signAndSendTransaction) {
        console.log("[PHANTOM] using signAndSendTransaction");
        const { signature } = await p.signAndSendTransaction(transaction);
        console.log("[PHANTOM] signature:", signature);

        try {
          setStatus("Confirming…");
          const conf0 = performance.now();
          await connection.confirmTransaction(signature, "confirmed");
          const conf1 = performance.now();
          console.log("[CHAIN] confirmed", { signature, ms: Math.round(conf1 - conf0) });
        } catch (e) {
          const info = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0,
          });
          console.error("[CHAIN] confirmation error; logs:", info?.meta?.logMessages);
          throw e;
        }
      } else if (p.signTransaction) {
        console.log("[PHANTOM] using signTransaction");
        const signed = await p.signTransaction(transaction);
        const raw = signed.serialize();
        console.log("[PHANTOM] signed tx bytes:", raw.length);

        const sig = await connection.sendRawTransaction(raw, {
          skipPreflight: false,
          preflightCommitment: "processed",
        });
        console.log("[CHAIN] sent raw tx; sig:", sig);

        try {
          setStatus("Confirming…");
          const conf0 = performance.now();
          await connection.confirmTransaction(sig, "confirmed");
          const conf1 = performance.now();
          console.log("[CHAIN] confirmed", { signature: sig, ms: Math.round(conf1 - conf0) });
        } catch (e) {
          const info = await connection.getTransaction(sig, {
            maxSupportedTransactionVersion: 0,
          });
          console.error("[CHAIN] confirmation error; logs:", info?.meta?.logMessages);
          throw e;
        }
      } else {
        throw new Error("Wallet cannot sign transactions");
      }

      const rec = {
        id: `${l.id}-${releaseTs}`,
        listingId: l.id,
        initializer: wallet,
        beneficiary: l.hostAddress,
        totalUi,
        releaseTs,
      };
      const past = JSON.parse(localStorage.getItem("bookings") || "[]");
      localStorage.setItem("bookings", JSON.stringify([...past, rec]));

      setStatus("Escrow created ✅ Redirecting…");
      nav("/dashboard");
    } catch (e: any) {
      setStatus(`Hold failed: ${e?.message || String(e)}`);
      console.error("[CLIENT] hold error:", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card main-card">
      <h2>Confirm your stay</h2>
      <div className="muted">
        {l.title} — {l.location}
      </div>

      <div className="row" style={{ gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <label className="label">Check-in</label>
          <input
            className="input"
            type="datetime-local"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            disabled={busy}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label">Check-out</label>
          <input
            className="input"
            type="datetime-local"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <div className="row space" style={{ marginTop: 12 }}>
        <div>
          <strong>Nights:</strong> {nights}
        </div>
        <div>
          <strong>Total:</strong> ${totalUi} USDC
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={placeHold}
        style={{ marginTop: 16 }}
        disabled={busy}
      >
        {busy ? "Processing…" : `Hold $${totalUi} in Escrow`}
      </button>

      {status && (
        <div
          className={`status ${/failed|error/i.test(status) ? "err" : "ok"}`}
          style={{ marginTop: 12 }}
        >
          {status}
        </div>
      )}
    </div>
  );
}
