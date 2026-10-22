"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

import { PAGE_TABS, isActive, type TabGroup } from "./nav";

/** Abas no topo das telas que dividem o mesmo item do menu (ex.: Funil e Para retomar). */
export function PageTabs({ group }: { group: TabGroup }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções"
      className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul className="inline-flex gap-1 rounded-xl border bg-muted/40 p-1">
        {PAGE_TABS[group].map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-8 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={`tab-${group}`}
                    aria-hidden
                    className="absolute inset-0 rounded-lg bg-background shadow-sm ring-1 ring-border"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className="relative size-4 shrink-0" />
                <span className="relative">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
