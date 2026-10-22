"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  ACCESS_LABELS,
  type AccessStatus,
  type AdminClinicRow,
} from "@/lib/admin/clinics";
import { cn } from "@/lib/utils";

type Row = AdminClinicRow & { access: AccessStatus };

const FILTERS = [
  { id: "todas", label: "Todas", test: () => true },
  {
    id: "em-dia",
    label: "Em dia",
    test: (r: Row) => r.access === "ativa" || r.access === "tolerancia",
  },
  {
    id: "sem-whatsapp",
    label: "Sem WhatsApp",
    test: (r: Row) =>
      (r.access === "ativa" || r.access === "tolerancia") &&
      !r.whatsapp_phone_number_id,
  },
  {
    id: "pausadas",
    label: "Assistente pausada",
    test: (r: Row) => Boolean(r.whatsapp_phone_number_id) && !r.is_active,
  },
  {
    id: "cota",
    label: "Cota acabando",
    test: (r: Row) =>
      Boolean(r.message_quota) &&
      (r.messages_used ?? 0) / r.message_quota! >= 0.8,
  },
  {
    id: "vencidas",
    label: "Vencidas / sem plano",
    test: (r: Row) => r.access === "vencida" || r.access === "sem",
  },
] as const;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const date = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const ACCESS_STYLES: Record<AccessStatus, string> = {
  ativa: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  tolerancia: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  vencida: "bg-destructive/10 text-destructive",
  sem: "bg-muted text-muted-foreground",
};

/** Tabela de clientes com busca (nome, e-mail, telefone, número) e filtros rápidos. */
export function ClinicsTable({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("todas");

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((f) => [f.id, rows.filter((r) => f.test(r)).length]),
      ),
    [rows],
  );

  const visible = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return rows.filter((r) => {
      if (!test(r)) return false;
      const haystack = normalize(
        [
          r.name,
          r.owner_name,
          r.owner_email,
          r.owner_phone,
          r.whatsapp_display_phone,
          r.whatsapp_phone_number_id,
          r.plan_name,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const digits = haystack.replace(/\D/g, "");
      // Telefones batem com ou sem máscara: "99999-0000" acha "5511999990000".
      return terms.every((t) => {
        const termDigits = t.replace(/\D/g, "");
        return (
          haystack.includes(t) ||
          (termDigits.length >= 4 && digits.includes(termDigits))
        );
      });
    });
  }, [rows, query, filter]);

  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por clínica, dona, e-mail ou telefone…"
            className="pl-9"
            aria-label="Buscar clientes"
          />
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="Filtrar"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                filter === f.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-accent/50",
              )}
            >
              {f.label}
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "Nenhuma clínica cadastrada ainda."
            : "Nenhuma clínica com esses filtros."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-5 py-3 font-medium">Clínica</th>
                <th className="px-3 py-3 font-medium">Assinatura</th>
                <th className="px-3 py-3 font-medium">Uso do ciclo</th>
                <th className="px-3 py-3 font-medium">WhatsApp</th>
                <th className="px-3 py-3 font-medium">Última conversa</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const usage =
                  r.message_quota && r.messages_used != null
                    ? Math.min(r.messages_used / r.message_quota, 1)
                    : 0;
                return (
                  <tr
                    key={r.id}
                    className="group relative border-b last:border-0 hover:bg-accent/40"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/clinicas/${r.id}`}
                        className="font-medium after:absolute after:inset-0"
                      >
                        {r.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.owner_name || "—"}
                        {r.owner_email && ` · ${r.owner_email}`}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          ACCESS_STYLES[r.access],
                        )}
                      >
                        {r.is_grant && r.access === "ativa"
                          ? "Liberado"
                          : ACCESS_LABELS[r.access]}
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.plan_name ?? "—"}
                        {r.current_period_end &&
                          ` · até ${date(r.current_period_end)}`}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {r.message_quota ? (
                        <>
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                usage >= 1
                                  ? "bg-destructive"
                                  : usage >= 0.8
                                    ? "bg-amber-500"
                                    : "bg-primary",
                              )}
                              style={{ width: `${usage * 100}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                            {r.messages_used ?? 0} / {r.message_quota}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r.whatsapp_phone_number_id ? (
                        <>
                          <p>{r.whatsapp_display_phone ?? "Conectado"}</p>
                          <p
                            className={cn(
                              "text-xs",
                              r.is_active
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground",
                            )}
                          >
                            {r.is_active ? "Assistente ligada" : "Pausada"}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Não conectado
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {r.last_message_at ? date(r.last_message_at) : "—"}
                    </td>
                    <td className="pr-4">
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
