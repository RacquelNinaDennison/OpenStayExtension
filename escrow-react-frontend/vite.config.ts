import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    // Inject Buffer, process, and other Node core shims for browser
    nodePolyfills({
      protocolImports: true,
      include: ['buffer', 'process']
    }),
  ],
  resolve: {
    // Make sure imports of "buffer" and "process" resolve to the browser shims
    alias: {
      buffer: 'buffer',
      process: 'process/browser',
    },
  },
  define: {
    // Some libs read these
    global: 'globalThis',
    'process.env': {}, // safe empty env for browser
  },
  optimizeDeps: {
    // Force Vite to prebundle these so the polyfills are applied everywhere
    include: [
      'buffer',
      'process',
      '@solana/web3.js',
      '@solana/spl-token',
      '@solana/spl-token-metadata',
    ],
  },
});
