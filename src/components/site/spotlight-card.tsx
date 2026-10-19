"use client";

import { cn } from "@/lib/utils";

/** Cartão com um brilho que segue o mouse. */
export function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--x", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--y", `${e.clientY - r.top}px`);
      }}
      className={cn(
        "group relative h-full overflow-hidden rounded-2xl border bg-card/70 p-6 shadow-sm backdrop-blur transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10",
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100",
        "before:bg-[radial-gradient(420px_circle_at_var(--x,50%)_var(--y,50%),color-mix(in_oklch,var(--primary)_14%,transparent),transparent_70%)]",
        className,
      )}
    >
      <div className="relative">{children}</div>
    </div>
  );
}
