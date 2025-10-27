import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount as getSplAccount,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";

import { Buffer } from "buffer";


type EscrowConfig = {
  RPC: string;
  PROGRAM_ID: PublicKey;
  USDC_MINT: PublicKey;
};

function getConfig(): EscrowConfig {
  const RPC = import.meta.env.VITE_SOLANA_RPC as string | undefined;
  const PROGRAM = import.meta.env.VITE_PROGRAM_ID as string | undefined;
  const MINT = import.meta.env.VITE_USDC_MINT as string | undefined;

  if (!RPC)      throw new Error("Missing VITE_SOLANA_RPC in your front-end env.");
  if (!PROGRAM)  throw new Error("Missing VITE_PROGRAM_ID in your front-end env.");
  if (!MINT)     throw new Error("Missing VITE_USDC_MINT in your front-end env.");

  return {
    RPC,
    PROGRAM_ID: new PublicKey(PROGRAM),
    USDC_MINT: new PublicKey(MINT),
  };
}


let _connection: Connection | null = null;
export function connection(): Connection {
  if (_connection) return _connection;
  const { RPC } = getConfig();
  _connection = new Connection(RPC, "confirmed");
  return _connection;
}


export type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  connect: (opts?: any) => Promise<{ publicKey: { toBase58(): string } }>;
  signAndSendTransaction?: (tx: Transaction) => Promise<{ signature: string }>;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
};
export const phantom = (): SolanaProvider | null => {
  const w = window as any;
  return w?.solana ?? w?.phantom?.solana ?? null;
};


function i64LeBytes(n: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigInt64(0, BigInt(n), true);
  return new Uint8Array(buf);
}
function u64LeBytes(n: string | number | bigint): Uint8Array {
  const v = typeof n === "bigint" ? n : BigInt(n);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, v, true);
  return new Uint8Array(buf);
}
function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

const DISC_INIT = new Uint8Array([0xaf,0xaf,0x6d,0x1f,0x0d,0x98,0x9b,0xed]);
const DISC_RELEASE = new Uint8Array([0xfd,0xf9,0x0f,0xce,0x1c,0x7f,0xc1,0xf1]);


const TOKEN_PROGRAM_ID      = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");


export function escrowPda(
  initializer: PublicKey,
  beneficiary: PublicKey,
  mint: PublicKey,
  releaseTs: number
): [PublicKey, number] {
  const { PROGRAM_ID } = getConfig();
  return PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode("escrow"),
      initializer.toBuffer(),
      beneficiary.toBuffer(),
      mint.toBuffer(),
      i64LeBytes(releaseTs),
    ],
    PROGRAM_ID
  );
}

export const ata = (owner: PublicKey, mint: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, false);
export const vaultAta = (pda: PublicKey, mint: PublicKey) =>
  getAssociatedTokenAddressSync(mint, pda, true);

// ---------- Instruction builders ----------
function ixInitialize(params: {
  initializer: PublicKey;
  beneficiary: PublicKey;
  mint: PublicKey;
  escrow: PublicKey;
  initializerAta: PublicKey;
  vaultAta: PublicKey;
  amount: string | number | bigint;
  releaseTs: number;
}): TransactionInstruction {
  const { PROGRAM_ID } = getConfig();

  const keys = [
    { pubkey: params.initializer,    isSigner: true,  isWritable: true },
    { pubkey: params.beneficiary,    isSigner: false, isWritable: false },
    { pubkey: params.mint,           isSigner: false, isWritable: false },
    { pubkey: params.escrow,         isSigner: false, isWritable: true  },
    { pubkey: params.initializerAta, isSigner: false, isWritable: true  },
    { pubkey: params.vaultAta,       isSigner: false, isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const data = concatBytes(DISC_INIT, u64LeBytes(params.amount), i64LeBytes(params.releaseTs));

  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: data as unknown as Buffer });
}

function ixRelease(params: {
  payer: PublicKey;
  beneficiary: PublicKey;
  mint: PublicKey;
  escrow: PublicKey;
  vaultAta: PublicKey;
  beneficiaryAta: PublicKey;
}): TransactionInstruction {
  const { PROGRAM_ID } = getConfig();

  const keys = [
    { pubkey: params.payer,          isSigner: true,  isWritable: true  },
    { pubkey: params.beneficiary,    isSigner: false, isWritable: false },
    { pubkey: params.mint,           isSigner: false, isWritable: false },
    { pubkey: params.escrow,         isSigner: false, isWritable: true  },
    { pubkey: params.vaultAta,       isSigner: false, isWritable: true  },
    { pubkey: params.beneficiaryAta, isSigner: false, isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,      isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: DISC_RELEASE as unknown as Buffer,
  });
}

// ---------- Public API ----------
export async function holdWithWallet(args: {
  wallet: SolanaProvider;
  initializer: string;
  beneficiary: string;
  amountBase: string;   // base units
  releaseTs: number;
}): Promise<string> {
  const { USDC_MINT } = getConfig();
  const conn = connection();

  const initializerPk = new PublicKey(args.initializer);
  const beneficiaryPk = new PublicKey(args.beneficiary);

  const [escrow]      = escrowPda(initializerPk, beneficiaryPk, USDC_MINT, args.releaseTs);
  const initializerTa = ata(initializerPk, USDC_MINT);
  const vault         = vaultAta(escrow, USDC_MINT);

  // Ensure initializer ATA exists and has funds
  try {
    const acc = await getSplAccount(conn, initializerTa);
    const have = BigInt(acc.amount.toString());
    const need = BigInt(args.amountBase);
    if (have < need) throw new Error(`Insufficient USDC: have ${have}, need ${need}`);
  } catch {
    throw new Error(`Initializer ATA missing or unfunded: ${initializerTa.toBase58()}`);
  }

  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(
      initializerPk, // payer
      vault,
      escrow,
      USDC_MINT
    ),
    ixInitialize({
      initializer: initializerPk,
      beneficiary: beneficiaryPk,
      mint: USDC_MINT,
      escrow,
      initializerAta: initializerTa,
      vaultAta: vault,
      amount: args.amountBase,
      releaseTs: args.releaseTs,
    }),
  ];

  const tx = new Transaction().add(...ixs);
  const { blockhash } = await conn.getLatestBlockhash("processed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = initializerPk;

  if (args.wallet.signAndSendTransaction) {
    const { signature } = await args.wallet.signAndSendTransaction(tx);
    await conn.confirmTransaction(signature, "confirmed");
    return signature;
  } else if (args.wallet.signTransaction) {
    const signed = await args.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    return sig;
  }
  throw new Error("Wallet cannot sign transactions");
}

export async function releaseWithWallet(args: {
  wallet: SolanaProvider;
  initializer: string;
  beneficiary: string;
  releaseTs: number;
}): Promise<string> {
  const { USDC_MINT } = getConfig();
  const conn = connection();

  if (!args.wallet.publicKey) await args.wallet.connect();
  const payerPk       = new PublicKey(args.wallet.publicKey!.toBase58());
  const initializerPk = new PublicKey(args.initializer);
  const beneficiaryPk = new PublicKey(args.beneficiary);

  const [escrow]      = escrowPda(initializerPk, beneficiaryPk, USDC_MINT, args.releaseTs);
  const vault         = vaultAta(escrow, USDC_MINT);
  const beneficiaryTa = ata(beneficiaryPk, USDC_MINT);

  const tx = new Transaction().add(
    ixRelease({
      payer: payerPk,
      beneficiary: beneficiaryPk,
      mint: USDC_MINT,
      escrow,
      vaultAta: vault,
      beneficiaryAta: beneficiaryTa,
    })
  );

  const { blockhash } = await conn.getLatestBlockhash("processed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payerPk;

  if (args.wallet.signAndSendTransaction) {
    const { signature } = await args.wallet.signAndSendTransaction(tx);
    await conn.confirmTransaction(signature, "confirmed");
    return signature;
  } else if (args.wallet.signTransaction) {
    const signed = await args.wallet.signTransaction(tx);
    const sig = await conn.sendRawTransaction(signed.serialize());
    await conn.confirmTransaction(sig, "confirmed");
    return sig;
  }
  throw new Error("Wallet cannot sign transactions");
}
