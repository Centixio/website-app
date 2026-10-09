"use client";

import Link from "next/link";
import { CreditCard, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AccountMenu({ email, mode }: { email: string; mode: "production" | "demo" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg" aria-label="Account menu" className="rounded-full">
          <User />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}{mode === "demo" ? " · demo" : ""}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/billing"><CreditCard /> Billing & credits</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/settings"><Settings /> Account settings</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action="/api/auth/sign-out" method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full"><LogOut /> Sign out</button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
