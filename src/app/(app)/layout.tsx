import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { AccountMenu } from "@/components/app/account-menu";
import { CreditBadge } from "@/components/app/credit-badge";
import { SiteFontsLoader } from "@/components/shared/font-loader";
import { requireSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const credits = await session.store.credits();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteFontsLoader />
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="rounded-md" aria-label="Dashboard"><Logo /></Link>
            <nav aria-label="App" className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex">
              <Link className="rounded-md px-3 py-1.5 hover:text-foreground" href="/dashboard">Projects</Link>
              <Link className="rounded-md px-3 py-1.5 hover:text-foreground" href="/gallery">Gallery</Link>
              <Link className="rounded-md px-3 py-1.5 hover:text-foreground" href="/billing">Billing</Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <CreditBadge credits={credits} demo={session.user.mode === "demo"} />
            <AccountMenu email={session.user.email} mode={session.user.mode} />
          </div>
        </div>
        {session.user.mode === "demo" && (
          <div className="border-t border-primary/20 bg-primary/10 px-4 py-1.5 text-center text-xs text-primary">
            Local demo mode — data is stored on this server, billing is disabled, and credits have no monetary value.
          </div>
        )}
      </header>
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
