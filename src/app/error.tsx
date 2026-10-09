"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="grid min-h-[70vh] place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-4xl">Something went wrong.</h1>
        <p className="mt-3 text-muted-foreground">
          An unexpected error occurred. Your projects and credits are safe.{error.digest ? ` (Reference: ${error.digest})` : ""}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" onClick={() => retry()}>
            Try again
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
