import { ClusterSelect } from "./components/cluster-select";
import { ConsoleShell } from "./components/console/console-shell";
import { WalletButton } from "./components/wallet-button";
import { ThemeToggle } from "./components/theme-toggle";

export default function Home() {
  return (
    <>
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div>
          <p className="text-sm font-semibold tracking-tight">
            Megapot Lottery
          </p>
          <p className="text-xs text-muted">Operations console</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <ClusterSelect />

          <WalletButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 pb-16">
        <ConsoleShell />
      </main>
    </>
  );
}
