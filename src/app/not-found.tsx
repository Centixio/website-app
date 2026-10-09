import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <Link href="/" className="inline-block rounded-md">
          <Logo />
        </Link>
        <p className="mt-10 font-mono text-sm text-primary">404</p>
        <h1 className="font-display mt-2 text-5xl">This page drifted off.</h1>
        <p className="mt-4 text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">Your projects</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
