"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client/api";

export function CheckoutButton({ kind, plan, label, variant = "default", disabled }: { kind: "plan" | "pack"; plan?: "starter" | "pro"; label: string; variant?: "default" | "outline"; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size="lg"
      disabled={busy || disabled}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await api<{ url: string }>("/api/billing/checkout", { method: "POST", json: kind === "plan" ? { kind, plan } : { kind } });
          window.location.assign(url);
        } catch (e) {
          toast.error((e as Error).message);
          setBusy(false);
        }
      }}
    >
      {busy && <Loader2 className="animate-spin" />} {label}
    </Button>
  );
}

export function PortalButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
          window.location.assign(url);
        } catch (e) {
          toast.error((e as Error).message);
          setBusy(false);
        }
      }}
    >
      {busy && <Loader2 className="animate-spin" />} Manage billing
    </Button>
  );
}

export function DemoTopUpButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/billing/demo-topup", { method: "POST" });
          toast.success("Added 50 demo credits (no monetary value).");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy && <Loader2 className="animate-spin" />} Add 50 demo credits
    </Button>
  );
}
