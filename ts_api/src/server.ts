import "dotenv/config";
import express from "express";
import cors from 'cors';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import bs58 from "bs58";

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' })); // dev only; tighten for prod

const RPC_URL = process.env.RPC_URL!;
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);
const USDC_MINT = new PublicKey(process.env.USDC_MINT!);

const connection = new Connection(RPC_URL, "confirmed");

// fee payer for /release (only pays tx fees)
const feePayer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.FEE_PAYER_SECRET!))
);

// derive escrow PDA
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
      Buffer.from(new anchor.BN(releaseTs).toArrayLike(Buffer, "le", 8)),
    ],
    PROGRAM_ID
  );
}

function vaultAta(escrow: PublicKey, mint: PublicKey) {
  return getAssociatedTokenAddressSync(mint, escrow, true); // owner is PDA
}

function ata(owner: PublicKey, mint: PublicKey) {
  return getAssociatedTokenAddressSync(mint, owner, false);
}

/**
 * POST /hold
 * body: { initializer, beneficiary, amount, releaseTs }
 * returns: { tx: base64 }
 * - Client (initializer) must sign & send.
 */
app.post("/hold", async (req, res) => {
  try {
    const { initializer, beneficiary, amount, releaseTs } = req.body as {
      initializer: string;
      beneficiary: string;
      amount: string;     // in base units (e.g., 6 decimals for USDC)
      releaseTs: number;  // UNIX seconds
    };

    const initializerPk = new PublicKey(initializer);
    const beneficiaryPk = new PublicKey(beneficiary);

    const [escrow, _bump] = escrowPda(
      initializerPk,
      beneficiaryPk,
      USDC_MINT,
      releaseTs
    );

    const initializerAta = ata(initializerPk, USDC_MINT);
    const vaultAtaAddr = vaultAta(escrow, USDC_MINT);

    // Build an unsigned transaction that:
    // 1) creates vault ATA if needed
    // 2) calls program.initialize(amount, releaseTs)
    const ixns: anchor.web3.TransactionInstruction[] = [];

    // Create vault ATA (PDA) if needed (safe to include always; will no-op if exists)
    ixns.push(
      createAssociatedTokenAccountInstruction(
        feePayer.publicKey,     // payer (client will replace feePayer when signing)
        vaultAtaAddr,
        escrow,                 // owner
        USDC_MINT
      )
    );

    // Prepare Anchor coder to build the instruction
    const idl = {
      version: "0.1.0",
      name: "timelock_escrow",
      instructions: [
        {
          name: "initialize",
          accounts: [
            { name: "initializer", isMut: true, isSigner: true },
            { name: "beneficiary", isMut: false, isSigner: false },
            { name: "mint", isMut: false, isSigner: false },
            { name: "escrow", isMut: true, isSigner: false },
            { name: "initializerAta", isMut: true, isSigner: false },
            { name: "vaultAta", isMut: true, isSigner: false },
            { name: "tokenProgram", isMut: false, isSigner: false },
            { name: "associatedTokenProgram", isMut: false, isSigner: false },
            { name: "systemProgram", isMut: false, isSigner: false }
          ],
          args: [
            { name: "amount", type: "u64" },
            { name: "releaseTs", type: "i64" }
          ]
        }
      ]
    } as anchor.Idl;

    const provider = new anchor.AnchorProvider(connection, {} as any, {});
    const program = new anchor.Program(idl, PROGRAM_ID, provider);

    const initializeIx = await program.methods
      .initialize(new anchor.BN(amount), new anchor.BN(releaseTs))
      .accounts({
        initializer: initializerPk,
        beneficiary: beneficiaryPk,
        mint: USDC_MINT,
        escrow,
        initializerAta,
        vaultAta: vaultAtaAddr,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    ixns.push(initializeIx);

    const tx = new Transaction().add(...ixns);

    // Set blockhash & fee payer as initializer (so wallet signs & pays)
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = initializerPk;

    const serialized = tx.serialize({ requireAllSignatures: false });
    const base64tx = serialized.toString("base64");
    return res.json({ tx: base64tx, lastValidBlockHeight });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message || "failed" });
  }
});

/**
 * POST /release
 * body: { initializer, beneficiary, releaseTs }
 * server sends the tx (server only pays fees; PDA signs inside program)
 */
app.post("/release", async (req, res) => {
  try {
    const { initializer, beneficiary, releaseTs } = req.body as {
      initializer: string;
      beneficiary: string;
      releaseTs: number;
    };

    const initializerPk = new PublicKey(initializer);
    const beneficiaryPk = new PublicKey(beneficiary);

    const [escrow, _bump] = escrowPda(
      initializerPk,
      beneficiaryPk,
      USDC_MINT,
      releaseTs
    );

    const vaultAtaAddr = vaultAta(escrow, USDC_MINT);
    const beneficiaryAta = ata(beneficiaryPk, USDC_MINT);

    const idl = {
      version: "0.1.0",
      name: "timelock_escrow",
      instructions: [
        {
          name: "release",
          accounts: [
            { name: "payer", isMut: true, isSigner: true },
            { name: "beneficiary", isMut: false, isSigner: false },
            { name: "mint", isMut: false, isSigner: false },
            { name: "escrow", isMut: true, isSigner: false },
            { name: "vaultAta", isMut: true, isSigner: false },
            { name: "beneficiaryAta", isMut: true, isSigner: false },
            { name: "tokenProgram", isMut: false, isSigner: false },
            { name: "associatedTokenProgram", isMut: false, isSigner: false },
            { name: "systemProgram", isMut: false, isSigner: false }
          ],
          args: []
        }
      ]
    } as anchor.Idl;

    const provider = new anchor.AnchorProvider(
      connection,
      {
        publicKey: feePayer.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(feePayer);
          return tx;
        },
        signAllTransactions: async (txs) => {
          txs.forEach((t) => t.partialSign(feePayer));
          return txs;
        },
      } as any,
      {}
    );
    const program = new anchor.Program(idl, PROGRAM_ID, provider);

    const ix = await program.methods
      .release()
      .accounts({
        payer: feePayer.publicKey,
        beneficiary: beneficiaryPk,
        mint: USDC_MINT,
        escrow,
        vaultAta: vaultAtaAddr,
        beneficiaryAta,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [feePayer]);
    return res.json({ signature: sig });
  } catch (e: any) {
    console.error(e);
    return res.status(400).json({ error: e.message || "failed" });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Escrow API listening on :${PORT}`);
});
