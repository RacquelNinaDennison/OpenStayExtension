import "dotenv/config";
import express from "express";
import cors from "cors";

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  TransactionInstruction,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import anchor from "@coral-xyz/anchor";
const { BN, AnchorProvider, Program, utils } = anchor;
type Idl = anchor.Idl;

// ----------------------------
// ENV
// ----------------------------
const RPC_URL = process.env.RPC_URL!;
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);
const USDC_MINT = new PublicKey(process.env.USDC_MINT!);

// Fee payer used ONLY for /release (pays network fees)
const feePayer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.FEE_PAYER_SECRET!))
);

// ----------------------------
// Setup
// ----------------------------
const connection = new Connection(RPC_URL, "confirmed");
const app = express();
app.use(cors({ origin: "*" })); // dev only; lock down for prod
app.use(express.json());

// ----------------------------
// Helpers
// ----------------------------
function i64LeBytes(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n));
  return b;
}

function escrowPda(
  initializer: PublicKey,
  beneficiary: PublicKey,
  mint: PublicKey,
  releaseTs: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      initializer.toBuffer(),
      beneficiary.toBuffer(),
      mint.toBuffer(),
      i64LeBytes(releaseTs),
    ],
    PROGRAM_ID
  );
}

function ata(owner: PublicKey, mint: PublicKey) {
  // owner is NOT a PDA here (initializer/beneficiary)
  return getAssociatedTokenAddressSync(mint, owner, false);
}

function vaultAta(escrow: PublicKey, mint: PublicKey) {
  // owner is the PDA, so "allowOwnerOffCurve = true"
  return getAssociatedTokenAddressSync(mint, escrow, true);
}

const idlInitialize: Idl = {
  address: PROGRAM_ID.toBase58(),
  metadata: {
    name: "timelock_escrow",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "initialize",
      discriminator: [],
      accounts: [
        { name: "initializer", writable: true, signer: true },
        { name: "beneficiary", writable: false, signer: false },
        { name: "mint", writable: false, signer: false },
        { name: "escrow", writable: true, signer: false },
        { name: "initializerAta", writable: true, signer: false },
        { name: "vaultAta", writable: true, signer: false },
        { name: "tokenProgram", writable: false, signer: false },
        { name: "associatedTokenProgram", writable: false, signer: false },
        { name: "systemProgram", writable: false, signer: false },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "releaseTs", type: "i64" },
      ],
    },
  ],
  accounts: [],
  types: [],
};

const idlRelease: Idl = {
  address: PROGRAM_ID.toBase58(),
  metadata: {
    name: "timelock_escrow",
    version: "0.1.0",
    spec: "0.1.0",
  },
  instructions: [
    {
      name: "release",
      discriminator: [],
      accounts: [
        { name: "payer", writable: true, signer: true },
        { name: "beneficiary", writable: false, signer: false },
        { name: "mint", writable: false, signer: false },
        { name: "escrow", writable: true, signer: false },
        { name: "vaultAta", writable: true, signer: false },
        { name: "beneficiaryAta", writable: true, signer: false },
        { name: "tokenProgram", writable: false, signer: false },
        { name: "associatedTokenProgram", writable: false, signer: false },
        { name: "systemProgram", writable: false, signer: false },
      ],
      args: [],
    },
  ],
  accounts: [],
  types: [],
};

// Provider factories (we use a dummy wallet for /hold, real for /release)
function unsignedProvider() {
  // minimal provider just to build instructions (no signing)
  return new AnchorProvider(connection, {} as any, {});
}
function feePayerProvider() {
  return new AnchorProvider(
    connection,
    {
      publicKey: feePayer.publicKey,
      signTransaction: async (tx: { partialSign: (arg0: Keypair) => void; }) => {
        tx.partialSign(feePayer);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        txs.forEach((t) => t.partialSign(feePayer));
        return txs;
      },
    } as any,
    {}
  );
}

// ----------------------------
// Routes
// ----------------------------

/**
 * POST /hold
 * body: { initializer, beneficiary, amount, releaseTs }
 * returns: { tx: base64, lastValidBlockHeight }
 *
 * - Client (initializer) must sign & send.
 * - We do NOT create ATAs here on the client side. The program's
 *   accounts have `init_if_needed` for vault; initializer ATA must exist/funded.
 */
app.post("/hold", async (req, res) => {
  try {
    const { initializer, beneficiary, amount, releaseTs } = req.body as {
      initializer: string;
      beneficiary: string;
      amount: string;    // base units (e.g. "10000000" for 10 USDC @ 6 decimals)
      releaseTs: number; // UNIX seconds (future)
    };
    console.log("Hold request:", req.body);
    console.log("Parsed releaseTs:", new Date(releaseTs * 1000).toISOString());
    console.log("Current time:", new Date().toISOString());
    console.log("init:", initializer, "benef:", beneficiary, "amt:", amount, "relTs:", releaseTs);
    if (!initializer || !beneficiary || !amount || typeof releaseTs !== "number") {
      return res.status(400).json({ error: "Missing fields" });
    }

    const initializerPk = new PublicKey(initializer);
    const beneficiaryPk = new PublicKey(beneficiary);
    console.log("Initializer PK:", initializerPk.toBase58());
    console.log("Beneficiary PK:", beneficiaryPk.toBase58());
    const [escrow] = escrowPda(initializerPk, beneficiaryPk, USDC_MINT, releaseTs);
    const initializerAta = ata(initializerPk, USDC_MINT);
    const vaultAtaAddr = vaultAta(escrow, USDC_MINT);

    const provider = unsignedProvider();
    const program = new Program(idlInitialize, provider);

    const initializeIx: TransactionInstruction = await program.methods
      .initialize(new BN(amount), new BN(releaseTs))
      .accounts({
        initializer: initializerPk,
        beneficiary: beneficiaryPk,
        mint: USDC_MINT,
        escrow,
        initializerAta,
        vaultAta: vaultAtaAddr,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(initializeIx);
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("finalized");

    tx.recentBlockhash = blockhash;
    tx.feePayer = initializerPk; // initializer signs & pays

    const serialized = tx.serialize({ requireAllSignatures: false });
    const base64tx = serialized.toString("base64");

    return res.json({ tx: base64tx, lastValidBlockHeight });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message || "failed" });
  }
});

/**
 * POST /release
 * body: { initializer, beneficiary, releaseTs }
 * returns: { signature }
 *
 * - Server signs & sends (fee payer only). PDA signs inside the program.
 */
app.post("/release", async (req, res) => {
  try {
    const { initializer, beneficiary, releaseTs } = req.body as {
      initializer: string;
      beneficiary: string;
      releaseTs: number;
    };

    if (!initializer || !beneficiary || typeof releaseTs !== "number") {
      return res.status(400).json({ error: "Missing fields" });
    }

    const initializerPk = new PublicKey(initializer);
    const beneficiaryPk = new PublicKey(beneficiary);

    const [escrow] = escrowPda(initializerPk, beneficiaryPk, USDC_MINT, releaseTs);
    const vaultAtaAddr = vaultAta(escrow, USDC_MINT);
    const beneficiaryAta = ata(beneficiaryPk, USDC_MINT);

    const provider = feePayerProvider();
    const program = new Program(idlRelease, provider);

    const ix: TransactionInstruction = await program.methods
      .release()
      .accounts({
        payer: feePayer.publicKey,
        beneficiary: beneficiaryPk,
        mint: USDC_MINT,
        escrow,
        vaultAta: vaultAtaAddr,
        beneficiaryAta,
        tokenProgram: utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    const signature = await sendAndConfirmTransaction(connection, tx, [feePayer]);
    return res.json({ signature });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e?.message || "failed" });
  }
});

// ----------------------------
// Start
// ----------------------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`Escrow API listening on :${PORT}`);
});