<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Connection, PublicKey, Transaction } from '@solana/web3.js';

  const API = import.meta.env.VITE_ESCROW_API as string;
  const RPC = import.meta.env.VITE_SOLANA_RPC as string;
  const USDC_DECIMALS = Number(import.meta.env.VITE_USDC_DECIMALS || 6);

  let connection: Connection;
  let provider: any = null;

  let connected = false;
  let walletPubkey: string | null = null;
  let status = '';
  let sig = '';
  let isLoading = false;

  let beneficiary = '';
  let amountUi = '10';
  let releaseLocal = toDatetimeLocal(new Date(Date.now() + 60_000));

  function toDatetimeLocal(d: Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function datetimeLocalToUnixSeconds(s: string) {
    return Math.floor(new Date(s).getTime() / 1000);
  }

  function uiToBase(ui: string, decimals: number): string {
    const [i, f = ''] = ui.trim().split('.');
    const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
    return (BigInt(i || '0') * BigInt(10 ** decimals) + BigInt(frac || '0')).toString();
  }

  function truncateAddress(addr: string): string {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  }

  onMount(() => {
    connection = new Connection(RPC, 'confirmed');

    const setupProvider = (walletProvider: any) => {
      if (walletProvider?.isPhantom) {
        provider = walletProvider;
        console.log('Phantom detected and setup');

        // Check if already connected
        if (provider.isConnected && provider.publicKey) {
          connected = true;
          walletPubkey = provider.publicKey.toBase58();
          status = 'Wallet connected successfully';
        } else {
          status = 'Ready to connect';
        }

        // Setup event listeners
        provider.on('connect', (publicKey: PublicKey) => {
          connected = true;
          walletPubkey = publicKey.toBase58();
          status = 'Wallet connected successfully';
        });

        provider.on('disconnect', () => {
          connected = false;
          walletPubkey = null;
          status = 'Wallet disconnected';
        });

        provider.on('accountChanged', (publicKey: PublicKey | null) => {
          if (publicKey) {
            walletPubkey = publicKey.toBase58();
            status = 'Account changed';
          } else {
            connected = false;
            walletPubkey = null;
            status = 'Wallet disconnected';
          }
        });
      }
    };

    const handleProviderReady = () => {
      const solanaProvider = (window as any).solana ?? (window as any).phantom?.solana;
      if (solanaProvider) {
        setupProvider(solanaProvider);
      } else {
        status = 'Phantom wallet not detected. Please install the Phantom extension.';
      }
    };

    // Check if the provider is already available
    if ((window as any).solana || (window as any).phantom?.solana) {
      handleProviderReady();
    } else {
      // If not, listen for the event that it's ready
      window.addEventListener('solana#ready', handleProviderReady, { once: true });
    }

    // Cleanup the event listener when the component is destroyed
    return () => {
      window.removeEventListener('solana#ready', handleProviderReady);
    };
  });


  onDestroy(() => {
    if (provider) {
      provider.removeAllListeners?.();
    }
  });

  async function connectWallet() {
    try {
      if (!provider?.isPhantom) {
        status = 'Phantom wallet not found. Please install the extension and refresh.';
        return;
      }
      
      isLoading = true;
      status = 'Requesting wallet connection...';
      
      const res = await provider.connect();
      // 'connect' event listener will handle state updates
    } catch (e: any) {
      if (e.code === 4001) {
        status = 'Connection rejected by user';
      } else if (e.message?.includes('User rejected')) {
        status = 'Connection rejected by user';
      } else {
        status = `Connection failed: ${e?.message || 'Unknown error'}`;
      }
      console.error('Connect error:', e);
    } finally {
      isLoading = false;
    }
  }

  async function disconnectWallet() {
    try {
      if (provider?.disconnect) {
        await provider.disconnect();
      }
      // 'disconnect' event listener will handle state updates
    } catch (e: any) {
      console.error('Disconnect error:', e);
    }
  }

  async function hold() {
    sig = '';
    if (!connected || !walletPubkey) {
      status = 'Please connect your wallet first';
      return;
    }
    if (!beneficiary) {
      status = 'Please enter beneficiary address';
      return;
    }

    try {
      isLoading = true;
      const initializerPk = new PublicKey(walletPubkey);
      const beneficiaryPk = new PublicKey(beneficiary);
      const amountBase = uiToBase(amountUi, USDC_DECIMALS);
      const releaseTs = datetimeLocalToUnixSeconds(releaseLocal);
      
      if (releaseTs <= Math.floor(Date.now() / 1000)) {
        status = 'Release time must be in the future';
        isLoading = false;
        return;
      }

      status = 'Preparing hold transaction...';
      const resp = await fetch(`${API}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initializer: initializerPk.toBase58(),
          beneficiary: beneficiaryPk.toBase58(),
          amount: amountBase,
          releaseTs
        })
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(errorText || 'API request failed');
      }

      const { tx } = await resp.json();
      const transaction = Transaction.from(Buffer.from(tx, 'base64'));

      status = 'Please approve transaction in Phantom...';
      
      const { signature } = await provider.signAndSendTransaction(transaction);
      status = 'Confirming transaction...';
      await connection.confirmTransaction(signature, 'confirmed');
      sig = signature;
      
      status = 'Hold completed successfully! ✅';
    } catch (e: any) {
      if (e.code === 4001 || e.message?.includes('User rejected')) {
        status = 'Transaction rejected by user';
      } else {
        status = `Hold failed: ${e?.message || 'Unknown error'}`;
      }
      console.error('Hold error:', e);
    } finally {
      isLoading = false;
    }
  }

  async function release() {
    sig = '';
    if (!connected || !walletPubkey) {
      status = 'Please connect your wallet first';
      return;
    }
    if (!beneficiary) {
      status = 'Please enter beneficiary address';
      return;
    }

    try {
      isLoading = true;
      const initializerPk = new PublicKey(walletPubkey);
      const beneficiaryPk = new PublicKey(beneficiary);
      const releaseTs = datetimeLocalToUnixSeconds(releaseLocal);

      status = 'Sending release request...';
      const resp = await fetch(`${API}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initializer: initializerPk.toBase58(),
          beneficiary: beneficiaryPk.toBase58(),
          releaseTs
        })
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(errorText || 'API request failed');
      }

      const { signature } = await resp.json();
      status = 'Confirming transaction...';
      await connection.confirmTransaction(signature, 'confirmed');
      sig = signature;
      status = 'Release completed successfully! ✅';
    } catch (e: any) {
      status = `Release failed: ${e?.message || 'Unknown error'}`;
      console.error('Release error:', e);
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>USDC Timelock Escrow</title>
</svelte:head>

<div class="container">
  <div class="header">
    <h1>USDC Timelock Escrow</h1>
    <p class="subtitle">Secure time-locked USDC transfers on Solana</p>
  </div>

  <div class="card main-card">
    <div class="wallet-section">
      <div class="wallet-info">
        <span class="label">Wallet Status</span>
        {#if connected && walletPubkey}
          <div class="wallet-badge connected">
            <span class="dot"></span>
            <span class="address">{truncateAddress(walletPubkey)}</span>
          </div>
        {:else}
          <div class="wallet-badge disconnected">
            <span class="dot"></span>
            <span>Not Connected</span>
          </div>
        {/if}
      </div>
      
      {#if connected}
        <button class="btn btn-secondary" on:click={disconnectWallet} disabled={isLoading}>
          Disconnect
        </button>
      {:else}
        <button class="btn btn-primary" on:click={connectWallet} disabled={isLoading}>
          {isLoading ? 'Connecting...' : 'Connect Phantom'}
        </button>
      {/if}
    </div>

    <div class="divider"></div>

    <div class="form-section">
      <div class="form-group">
        <label class="form-label">
          <span>Beneficiary Address</span>
          <span class="required">*</span>
        </label>
        <input 
          class="input" 
          bind:value={beneficiary} 
          placeholder="Enter Solana wallet address"
          disabled={isLoading}
        />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">
            <span>Amount (USDC)</span>
            <span class="required">*</span>
          </label>
          <input 
            class="input" 
            bind:value={amountUi} 
            type="number" 
            min="0" 
            step="0.000001"
            placeholder="0.00"
            disabled={isLoading}
          />
        </div>
        
        <div class="form-group">
          <label class="form-label">
            <span>Release Time</span>
            <span class="required">*</span>
          </label>
          <input 
            class="input datetime-input" 
            type="datetime-local" 
            bind:value={releaseLocal}
            disabled={isLoading}
          />
        </div>
      </div>
    </div>

    <div class="action-buttons">
      <button 
        class="btn btn-large btn-primary" 
        on:click={hold}
        disabled={!connected || isLoading}
      >
        {isLoading ? 'Processing...' : 'Initialize Hold'}
      </button>
      <button 
        class="btn btn-large btn-accent" 
        on:click={release}
        disabled={!connected || isLoading}
      >
        {isLoading ? 'Processing...' : 'Release Funds'}
      </button>
    </div>

    {#if status}
      <div class="status-message" class:success={status.includes('✅')} class:error={status.includes('failed') || status.includes('rejected')}>
        <div class="status-icon">
          {#if status.includes('✅')}
            ✓
          {:else if status.includes('failed') || status.includes('rejected')}
            ✕
          {:else}
            ℹ
          {/if}
        </div>
        <span>{status}</span>
      </div>
    {/if}

    {#if sig}
      <div class="transaction-link">
        <span class="tx-label">Transaction:</span>
        <a 
          class="tx-signature" 
          target="_blank" 
          rel="noreferrer" 
          href={`https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC)}`}
        >
          {truncateAddress(sig)} →
        </a>
      </div>
    {/if}
  </div>

  <div class="info-card">
    <h3>How it works</h3>
    <ul>
      <li><strong>Initialize Hold:</strong> Lock USDC with a time-based release condition</li>
      <li><strong>Release Funds:</strong> After the specified time, transfer funds to beneficiary</li>
      <li><strong>Secure:</strong> Funds are held in an on-chain escrow program</li>
    </ul>
    <p class="api-info">
      Backend API: <code class="code-inline">{API}</code>
    </p>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
    min-height: 100vh;
  }

  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 20px;
  }

  .header {
    text-align: center;
    margin-bottom: 32px;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1a202c;
    margin: 0 0 8px 0;
    letter-spacing: -0.5px;
  }

  .subtitle {
    font-size: 1.1rem;
    color: #718096;
    margin: 0;
  }

  .card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05), 0 10px 20px rgba(0, 0, 0, 0.08);
    padding: 32px;
    margin-bottom: 24px;
  }

  .main-card {
    border-top: 4px solid #14b8a6;
  }

  .wallet-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 24px;
  }

  .wallet-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #4a5568;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .wallet-badge {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .wallet-badge.connected {
    background: #d1fae5;
    color: #065f46;
  }

  .wallet-badge.disconnected {
    background: #fee2e2;
    color: #991b1b;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  .connected .dot {
    background: #10b981;
  }

  .disconnected .dot {
    background: #ef4444;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .address {
    font-family: 'Courier New', monospace;
    font-size: 0.9rem;
  }

  .divider {
    height: 1px;
    background: linear-gradient(to right, transparent, #e2e8f0, transparent);
    margin: 24px 0;
  }

  .form-section {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 28px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-label {
    font-size: 0.925rem;
    font-weight: 600;
    color: #2d3748;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .required {
    color: #e53e3e;
  }

  .input {
    width: 100%;
    padding: 14px 16px;
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    font-size: 1rem;
    transition: all 0.2s ease;
    background: #fafafa;
    box-sizing: border-box;
  }

  .input:focus {
    outline: none;
    border-color: #14b8a6;
    background: white;
    box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .datetime-input {
    font-family: inherit;
  }

  .action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }

  .btn {
    padding: 12px 24px;
    border-radius: 12px;
    border: none;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-large {
    padding: 16px 24px;
    font-size: 1.05rem;
  }

  .btn-primary {
    background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(20, 184, 166, 0.4);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-secondary {
    background: #f1f5f9;
    color: #475569;
    border: 2px solid #e2e8f0;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e2e8f0;
  }

  .btn-accent {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .btn-accent:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
  }

  .status-message {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border-radius: 12px;
    background: #eff6ff;
    border-left: 4px solid #3b82f6;
    color: #1e40af;
    font-size: 0.95rem;
    margin-top: 16px;
  }

  .status-message.success {
    background: #d1fae5;
    border-left-color: #10b981;
    color: #065f46;
  }

  .status-message.error {
    background: #fee2e2;
    border-left-color: #ef4444;
    color: #991b1b;
  }

  .status-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-weight: bold;
    flex-shrink: 0;
  }

  .success .status-icon {
    background: #10b981;
    color: white;
  }

  .error .status-icon {
    background: #ef4444;
    color: white;
  }

  .transaction-link {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: #f8fafc;
    border-radius: 10px;
    margin-top: 12px;
    font-size: 0.9rem;
  }

  .tx-label {
    font-weight: 600;
    color: #64748b;
  }

  .tx-signature {
    color: #14b8a6;
    text-decoration: none;
    font-family: 'Courier New', monospace;
    font-weight: 500;
  }

  .tx-signature:hover {
    text-decoration: underline;
  }

  .info-card {
    background: white;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .info-card h3 {
    margin: 0 0 16px 0;
    color: #1a202c;
    font-size: 1.2rem;
  }

  .info-card ul {
    margin: 0 0 16px 0;
    padding-left: 24px;
    color: #4a5568;
    line-height: 1.8;
  }

  .info-card li {
    margin-bottom: 8px;
  }

  .api-info {
    margin: 16px 0 0 0;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    color: #718096;
    font-size: 0.875rem;
  }

  .code-inline {
    background: #f1f5f9;
    padding: 3px 8px;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    color: #475569;
  }

  @media (max-width: 640px) {
    .container {
      padding: 20px 16px;
    }

    h1 {
      font-size: 2rem;
    }

    .card {
      padding: 24px 20px;
    }

    .form-row,
    .action-buttons {
      grid-template-columns: 1fr;
    }

    .wallet-section {
      flex-direction: column;
      align-items: stretch;
    }

    .btn {
      width: 100%;
    }
  }
</style>