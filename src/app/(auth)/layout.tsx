import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit rounded-md"><Logo /></Link>
        <main id="main" className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</main>
      </div>
      <div className="relative hidden overflow-hidden border-l border-border/60 bg-card/40 lg:block" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_60%_40%,oklch(0.82_0.13_78/0.18),transparent_70%)]" />
        <div className="absolute bottom-12 left-12 right-12">
          <p className="font-display text-5xl leading-tight">“A rotating bottle under warm light, a camera that follows the scroll.”</p>
          <p className="mt-4 text-sm text-muted-foreground">— the kind of direction you can just describe.</p>
        </div>
      </div>
    </div>
  );
}
