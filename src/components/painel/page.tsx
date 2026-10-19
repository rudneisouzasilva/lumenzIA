import { cn } from "@/lib/utils";

/** Título de cada tela do painel. */
export function PageHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-glow/15 text-primary ring-1 ring-primary/15">
          <Icon className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Cartão de uma seção de configuração. */
export function PanelCard({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      {title && (
        <div className="mb-5">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/** Esqueleto enquanto a tela carrega os dados da clínica. */
export function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="h-48 rounded-2xl bg-muted" />
      <div className="h-32 rounded-2xl bg-muted" />
    </div>
  );
}
