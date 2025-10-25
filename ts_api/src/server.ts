import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SimulatedTransactionResponse,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount as getSplAccount, // SPL helper (throws if missing)
} from "@solana/spl-token";
import { createHash } from "crypto";

// ---------- ENV ----------
const RPC_URL    = process.env.RPC_URL!;
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);
const USDC_MINT  = new PublicKey(process.env.USDC_MINT!);
const LOG_SIMULATE = process.env.LOG_SIMULATE === "1";

const feePayer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.FEE_PAYER_SECRET!))
);

// ---------- Setup ----------
const connection = new Connection(RPC_URL, "confirmed");
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

// Tiny request logger
app.use((req, _res, next) => {
  const size = Number(req.get("content-length") || 0);
  console.log(`[REQ] ${req.method} ${req.path} (${size} bytes)`);
  if (req.method !== "GET") {
    try { console.log("[REQ:body]", JSON.stringify(req.body)); } catch {}
  }
  next();
});

const b58 = (pk: PublicKey) => pk.toBase58();

// ---------- Helpers ----------
function i64LeBytes(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n));
  return b;
}
function u64LeBytes(n: bigint | number | string): Buffer {
  const v = typeof n === "bigint" ? n : BigInt(n);
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(v);
  return b;
}
function discriminator(ix: string): Buffer {
  const h = createHash("sha256").update(`global:${ix}`).digest();
  return h.subarray(0, 8);
}

function escrowPda(
  initializer: PublicKey,
  beneficiary: PublicKey,
  mint: PublicKey,
  releaseTs: number
): [PublicKey, number] {
  const seeds = [
    Buffer.from("escrow"),
    initializer.toBuffer(),
    beneficiary.toBuffer(),
    mint.toBuffer(),
    i64LeBytes(releaseTs),
  ];
  const out = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
  console.log("[PDA] escrow seeds:", {
    initializer: b58(initializer),
    beneficiary: b58(beneficiary),
    mint: b58(mint),
    releaseTs,
  });
  console.log("[PDA] escrow:", b58(out[0]), "bump:", out[1]);
  return out;
}

function ata(owner: PublicKey, mint: PublicKey) {
  const addr = getAssociatedTokenAddressSync(mint, owner, false);
  console.log("[ATA] normal ATA", { owner: b58(owner), mint: b58(mint), ata: b58(addr) });
  return addr;
}
function vaultAta(pda: PublicKey, mint: PublicKey) {
  const addr = getAssociatedTokenAddressSync(mint, pda, true);
  console.log("[ATA] PDA vault ATA", { ownerPda: b58(pda), mint: b58(mint), ata: b58(addr) });
  return addr;
}

// initialize instruction (raw Anchor layout)
function buildInitializeIx(params: {
  initializer: PublicKey;
  beneficiary: PublicKey;
  mint: PublicKey;
  escrow: PublicKey;
  initializerAta: PublicKey;
  vaultAta: PublicKey;
  amount: string | number | bigint;
  releaseTs: number;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.initializer,    isSigner: true,  isWritable: true },
    { pubkey: params.beneficiary,    isSigner: false, isWritable: false },
    { pubkey: params.mint,           isSigner: false, isWritable: false },
    { pubkey: params.escrow,         isSigner: false, isWritable: true  },
    { pubkey: params.initializerAta, isSigner: false, isWritable: true  },
    { pubkey: params.vaultAta,       isSigner: false, isWritable: true  },
    { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
    { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const disc  = discriminator("initialize");
  const data  = Buffer.concat([disc, u64LeBytes(params.amount), i64LeBytes(params.releaseTs)]);

  console.log("[IX:init] keys:", keys.map(k => ({ pubkey: b58(k.pubkey), ...k })));
  console.log("[IX:init] data len:", data.length, "disc:", disc.toString("hex"));

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data });
}

// release instruction (no args)
function buildReleaseIx(params: {
  payer: PublicKey;
  beneficiary: PublicKey;
  mint: PublicKey;
  escrow: PublicKey;
  vaultAta: PublicKey;
  beneficiaryAta: PublicKey;
}): TransactionInstruction {
  const keys = [
    { pubkey: params.payer,          isSigner: true,  isWritable: true  },
    { pubkey: params.beneficiary,    isSigner: false, isWritable: false },
    { pubkey: params.mint,           isSigner: false, isWritable: false },
    { pubkey: params.escrow,         isSigner: false, isWritable: true  },
    { pubkey: params.vaultAta,       isSigner: false, isWritable: true  },
    { pubkey: params.beneficiaryAta, isSigner: false, isWritable: true  },
    { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
    { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  const disc = discriminator("release");
  console.log("[IX:release] keys:", keys.map(k => ({ pubkey: b58(k.pubkey), ...k })));
  console.log("[IX:release] data len:", disc.length, "disc:", disc.toString("hex"));
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: disc });
}

async function maybeSimulate(label: string, tx: Transaction): Promise<void> {
  if (!LOG_SIMULATE) return;
  try {
    const sim = await connection.simulateTransaction(tx, []);
    const logs = (sim as SimulatedTransactionResponse).value?.logs || [];
    console.log(`[SIM:${label}] logs:`);
    logs.forEach((l) => console.log("  ", l));
  } catch (e) {
    console.log(`[SIM:${label}] failed:`, (e as any)?.message || e);
  }
}

// ---------- Routes ----------

/**
 * POST /hold
 * body: { initializer, beneficiary, amount, releaseTs }
 * returns: { tx, lastValidBlockHeight }
 *
 * Client signs & sends.
 */
app.post("/hold", async (req, res) => {
  try {
    const { initializer, beneficiary, amount, releaseTs } = req.body as {
      initializer: string;
      beneficiary: string;
      amount: string;     // base units string
      releaseTs: number;  // unix seconds
    };

    console.log("[HOLD] input:", { initializer, beneficiary, amount, releaseTs });
    if (!initializer || !beneficiary || !amount || typeof releaseTs !== "number") {
      console.log("[HOLD] missing fields");
      return res.status(400).json({ error: "Missing fields" });
    }

    const now = Math.floor(Date.now() / 1000);
    console.log("[HOLD] now:", now, "releaseTs:", releaseTs, "delta(s):", releaseTs - now);

    const initializerPk = new PublicKey(initializer);
    const beneficiaryPk = new PublicKey(beneficiary);

    const [escrow] = escrowPda(initializerPk, beneficiaryPk, USDC_MINT, releaseTs);
    const initializerAta = ata(initializerPk, USDC_MINT);
    const vault          = vaultAta(escrow, USDC_MINT);

    // --- Balance check (clear error instead of Phantom "unexpected error")
    try {
      const acc = await getSplAccount(connection, initializerAta);
      const bal = BigInt(acc.amount.toString());
      const need = BigInt(amount);
      console.log("[HOLD] balance check:", { have: bal.toString(), need: need.toString() });
      if (bal < need) {
        return res.status(400).json({
          error: `Insufficient USDC: have ${bal.toString()}, need ${need.toString()}`,
        });
      }
    } catch {
      return res.status(400).json({
        error: `Initializer ATA does not exist. Please create and fund ${b58(initializerAta)}.`,
      });
    }

    const ixs: TransactionInstruction[] = [];

    // Only create the VAULT ATA (idempotent); do NOT try to create initializer's ATA here.
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(
        initializerPk,  // payer = initializer
        vault,
        escrow,         // owner is PDA
        USDC_MINT
      )
    );

    // Program initialize ix
    ixs.push(
      buildInitializeIx({
        initializer: initializerPk,
        beneficiary: beneficiaryPk,
        mint: USDC_MINT,
        escrow,
        initializerAta,
        vaultAta: vault,
        amount,
        releaseTs,
      })
    );

    const tx = new Transaction().add(...ixs);
    // Use a fresher blockhash to reduce expiry while the wallet prompts
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("processed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = initializerPk;

    console.log("[HOLD] blockhash:", blockhash, "lvbh:", lastValidBlockHeight);
    console.log("[HOLD] feePayer:", b58(initializerPk));

    await maybeSimulate("HOLD", tx);

    const raw = tx.serialize({ requireAllSignatures: false });
    console.log("[HOLD] serialized bytes:", raw.length);
    const base64 = raw.toString("base64");

    return res.json({ tx: base64, lastValidBlockHeight });
  } catch (e: any) {
    console.error("HOLD ERROR:", e?.stack || e);
    return res.status(400).json({ error: e?.message || "failed" });
  }
});

/**
 * POST /release
 * body: { initializer, beneficiary, releaseTs }
 * returns: { signature }
 *
 * Server pays the fee; the PDA authority signs in-program.
 */
app.post("/release", async (req, res) => {
  try {
    const { initializer, beneficiary, releaseTs } = req.body as {
      initializer: string;
      beneficiary: string;
      releaseTs: number;
    };

    console.log("[REL] input:", { initializer, beneficiary, releaseTs });
    if (!initializer || !beneficiary || typeof releaseTs !== "number") {
      console.log("[REL] missing fields");
      return res.status(400).json({ error: "Missing fields" });
    }

    const initializerPk = new PublicKey(initializer);
    const beneficiaryPk = new PublicKey(beneficiary);

    const [escrow]      = escrowPda(initializerPk, beneficiaryPk, USDC_MINT, releaseTs);
    const vault         = vaultAta(escrow, USDC_MINT);
    const beneficiaryTa = ata(beneficiaryPk, USDC_MINT);

    const ix = buildReleaseIx({
      payer: feePayer.publicKey,
      beneficiary: beneficiaryPk,
      mint: USDC_MINT,
      escrow,
      vaultAta: vault,
      beneficiaryAta: beneficiaryTa,
    });

    const tx = new Transaction().add(ix);
    const { blockhash } = await connection.getLatestBlockhash("processed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer.publicKey;

    console.log("[REL] blockhash:", blockhash);
    console.log("[REL] feePayer:", b58(feePayer.publicKey));

    await maybeSimulate("RELEASE", tx);

    const sig = await sendAndConfirmTransaction(connection, tx, [feePayer]);
    console.log("[REL] signature:", sig);
    return res.json({ signature: sig });
  } catch (e: any) {
    console.error("RELEASE ERROR:", e?.stack || e);
    return res.status(400).json({ error: e?.message || "failed" });
  }
});

// ---------- Start ----------
const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`Escrow API listening on :${PORT}`));
