import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

export async function SiteHeader() {
  const session = await getSession().catch(() => null);
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="Centixio home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          <Link className="rounded-md px-3 py-2 hover:text-foreground" href="/#samples">Samples</Link>
          <Link className="rounded-md px-3 py-2 hover:text-foreground" href="/gallery">Gallery</Link>
          <Link className="rounded-md px-3 py-2 hover:text-foreground" href="/pricing">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          {session ? (
            <Button asChild size="lg">
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="lg">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="lg">
                <Link href="/sign-up">Start a project</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
