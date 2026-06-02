import { Providers } from "@/app/providers";
import { ShellProvider } from "@/app/shell";
import { AppShell } from "@/components/layout/AppShell";

export default function App() {
  return (
    <Providers>
      <ShellProvider>
        <AppShell />
      </ShellProvider>
    </Providers>
  );
}
