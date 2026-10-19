"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { motion } from "motion/react";

import { signOut } from "@/app/(auth)/actions";
import { LogoMark } from "@/components/site/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { CommandPalette } from "./command-palette";
import { NAV_SECTIONS, isActive } from "./nav";
import { usePendingCount } from "./pending-watcher";

// Telas que precisam de largura (duas colunas de conversa, gráficos).
const WIDE_ROUTES = ["/painel/atendimento", "/painel/relatorios"];

// A barra lateral recolhida é uma preferência do navegador (não precisa ir para o banco).
const COLLAPSED_KEY = "lumenzia:sidebar-collapsed";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Navegação privada: a preferência só vale até recarregar.
  }
  listeners.forEach((l) => l());
}

export function PanelShell({
  clinicSlot,
  watcherSlot,
  children,
}: {
  clinicSlot: React.ReactNode;
  watcherSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const wide = WIDE_ROUTES.some((r) => isActive(pathname, r));
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-svh flex-1">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-card/50 backdrop-blur-xl transition-[width] duration-300 md:flex",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <div className="flex h-16 items-center px-4">
          <Link
            href="/painel"
            className="flex items-center gap-2 overflow-hidden font-display text-xl font-semibold tracking-tight"
          >
            <LogoMark className="shrink-0" />
            <span className={cn(collapsed && "sr-only")}>
              Lumenz<span className="text-primary">IA</span>
            </span>
          </Link>
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className="border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => writeCollapsed(!collapsed)}
            className={cn(
              "w-full justify-start text-muted-foreground",
              collapsed && "justify-center",
            )}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && "Recolher menu"}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <div className="min-w-0 truncate text-sm font-medium">
              {clinicSlot}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchOpen(true)}
                className="gap-2 text-muted-foreground sm:w-56 sm:justify-start"
                aria-label="Buscar no painel"
              >
                <Search />
                <span className="hidden sm:inline">Buscar…</span>
                <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
                  Ctrl K
                </kbd>
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
        </header>
        <main
          className={cn(
            "relative mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10",
            wide ? "max-w-7xl" : "max-w-4xl",
          )}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[36rem] -translate-x-1/2 rounded-full bg-primary/8 blur-3xl"
          />
          {children}
        </main>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="top-0 left-0 flex h-full max-w-72 translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-72"
          aria-describedby={undefined}
        >
          <DialogTitle className="flex h-16 items-center gap-2 px-4 font-display text-xl tracking-tight">
            <LogoMark />
            <span>
              Lumenz<span className="text-primary">IA</span>
            </span>
          </DialogTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      {watcherSlot}
    </div>
  );
}

function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const pendingCount = usePendingCount();

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p
            className={cn(
              "mb-2 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase",
              collapsed && "sr-only",
            )}
          >
            {section.title}
          </p>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                      active
                        ? "font-medium text-primary"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={
                          onNavigate ? "nav-active-mobile" : "nav-active"
                        }
                        aria-hidden
                        className="absolute inset-0 rounded-lg bg-primary/10"
                        transition={{
                          type: "spring",
                          stiffness: 420,
                          damping: 34,
                        }}
                      />
                    )}
                    <Icon className="relative size-4 shrink-0" />
                    <span className={cn("relative", collapsed && "sr-only")}>
                      {item.label}
                    </span>
                    {item.href === "/painel/atendimento" &&
                      pendingCount > 0 && (
                        <span
                          className={cn(
                            "relative ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white tabular-nums",
                            collapsed &&
                              "absolute top-0.5 right-1 ml-0 h-4 min-w-4 px-1 text-[10px]",
                          )}
                          aria-label={`${pendingCount} precisando de atendimento`}
                        >
                          {pendingCount}
                        </span>
                      )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
