"use client";

import { useWallet } from "../wallet/context";
import { useConfig } from "./accounts";

export function useIsAdmin(): boolean {
  const { signer, wallet } = useWallet();
  const { config } = useConfig();
  const walletAddress = signer?.address ?? wallet?.account.address;
  return !!(config && walletAddress && config.admin === walletAddress);
}
