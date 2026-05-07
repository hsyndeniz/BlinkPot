"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { PropsWithChildren } from "react";
import { ClusterProvider } from "./cluster-context";
import { WalletProvider } from "../lib/wallet/context";
import { SolanaClientProvider } from "../lib/solana-client-context";

// Solana RPC errors carry BigInt fields (slot numbers, instruction indexes).
// Next's dev error overlay JSON.stringify's thrown errors to ship them to the
// client overlay and crashes on BigInt. Teach BigInt to serialize as a string.
Object.defineProperty(BigInt.prototype, "toJSON", {
  value: function () {
    return this.toString();
  },
  writable: true,
  configurable: true,
});

export function Providers({ children }: PropsWithChildren) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <ClusterProvider>
        <SolanaClientProvider>
          <WalletProvider>{children}</WalletProvider>
        </SolanaClientProvider>
        <Toaster position="bottom-right" richColors />
      </ClusterProvider>
    </ThemeProvider>
  );
}
