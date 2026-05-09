import { AppHeader } from "../components/app-header";
import { ConsoleShell } from "../components/console/console-shell";

export default function ConsolePage() {
  return (
    <>
      <AppHeader eyebrow="Operations console" />
      <main className="mx-auto max-w-7xl px-6 py-4">
        <ConsoleShell />
      </main>
    </>
  );
}
