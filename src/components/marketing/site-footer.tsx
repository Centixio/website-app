import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { brand } from "@/config/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">{brand.description}</p>
        </div>
        <nav aria-label="Product" className="grid content-start gap-2 text-sm text-muted-foreground">
          <Link className="hover:text-foreground" href="/#samples">Sample sites</Link>
          <Link className="hover:text-foreground" href="/gallery">Models & presets</Link>
          <Link className="hover:text-foreground" href="/pricing">Pricing</Link>
        </nav>
        <div className="grid content-start gap-2 text-sm text-muted-foreground">
          <Link className="hover:text-foreground" href="/sign-in">Sign in</Link>
          <a className="hover:text-foreground" href={`mailto:${brand.supportEmail}`}>Support</a>
          <Link className="hover:text-foreground" href="/terms">Terms</Link>
          <Link className="hover:text-foreground" href="/privacy">Privacy</Link>
          <span className="pt-2 text-xs">© {new Date().getFullYear()} {brand.name}</span>
        </div>
      </div>
    </footer>
  );
}
