import { useId } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="var(--glow)" />
          <stop offset="55%" stopColor="var(--primary)" />
          <stop
            offset="100%"
            stopColor="color-mix(in oklch, var(--primary) 60%, black)"
          />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#${gradientId})`} />
      <path
        d="M16 7.5l1.9 5.2 5.2 1.9-5.2 1.9L16 21.7l-1.9-5.2-5.2-1.9 5.2-1.9z"
        fill="white"
        fillOpacity="0.92"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight",
        className,
      )}
    >
      <LogoMark />
      <span>
        Lumenz<span className="text-primary">IA</span>
      </span>
    </Link>
  );
}
