"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  LogOut,
  Rocket,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { motion } from "motion/react";

import { signOut } from "@/app/(auth)/actions";
import { LogoMark } from "@/components/site/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Clientes", icon: Building2 },
  { href: "/admin/auditoria", label: "Auditoria", icon: ScrollText },
  { href: "/admin/lancamento", label: "Lançamento", icon: Rocket },
];

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin" || pathname.startsWith("/admin/clinicas")
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Moldura do painel da equipe LumenzIA: abas no topo, sem a barra lateral da clínica. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/admin"
            className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight"
          >
            <LogoMark className="shrink-0" />
            <span className="hidden sm:inline">
              Lumenz<span className="text-primary">IA</span>
            </span>
          </Link>
          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <ShieldCheck className="size-3.5" />
            Equipe
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/painel">
                <ArrowLeft />
                <span className="hidden sm:inline">Painel da clínica</span>
              </Link>
            </Button>
            <ThemeToggle />
            <form action={signOut}>
              <Button
                variant="ghost"
                size="icon"
                type="submit"
                aria-label="Sair"
                title="Sair"
              >
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
        {/* Na ficha da clínica o endereço só existe na hora do pedido: as abas entram depois. */}
        <Suspense fallback={<AdminNav pathname="" />}>
          <LiveAdminNav />
        </Suspense>
      </header>
      <main className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-primary/8 blur-3xl"
        />
        {children}
      </main>
    </div>
  );
}

function LiveAdminNav() {
  return <AdminNav pathname={usePathname()} />;
}

function AdminNav({ pathname }: { pathname: string }) {
  return (
    <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-11 items-center gap-2 px-3 text-sm whitespace-nowrap transition-colors",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
            {active && (
              <motion.span
                layoutId="admin-tab"
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
