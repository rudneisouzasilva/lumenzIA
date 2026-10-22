"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Gift, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { endGrant, grantAccess } from "@/app/(admin)/admin/actions";
import { FieldError } from "@/components/painel/form-parts";
import { selectClassName } from "@/components/painel/template-send-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type GrantClinic = {
  id: string;
  name: string;
  ownerEmail: string | null;
  /** Situação do acesso em vigor, para mostrar ao lado do nome. */
  status: string;
  paid: boolean;
};

export type GrantPlan = { id: number; name: string; quota: number };

export type GrantRow = {
  id: string;
  clinicId: string;
  clinicName: string;
  planName: string;
  quota: number;
  used: number;
  start: string | null;
  end: string | null;
  note: string | null;
  grantedBy: string | null;
};

const PRESETS = [7, 14, 30];

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

/** Data em que termina um acesso liberado hoje por `days` dias, ou null se o número não serve. */
function untilLabel(days: number) {
  return Number.isInteger(days) && days > 0 && days <= 365
    ? date(new Date(Date.now() + days * 86400_000).toISOString())
    : null;
}

const isFuture = (iso: string | null) =>
  iso != null && Date.parse(iso) > Date.now();

/** Formulário de liberar um plano por alguns dias, sem cobrança. */
export function GrantForm({
  clinics,
  plans,
}: {
  clinics: GrantClinic[];
  plans: GrantPlan[];
}) {
  const [query, setQuery] = useState("");
  const [clinicId, setClinicId] = useState("");
  const [planId, setPlanId] = useState(plans[0] ? String(plans[0].id) : "");
  const [days, setDays] = useState("14");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return clinics.filter((c) => {
      const haystack = normalize(`${c.name} ${c.ownerEmail ?? ""}`);
      return c.id === clinicId || terms.every((t) => haystack.includes(t));
    });
  }, [clinics, query, clinicId]);
  const chosen = clinics.find((c) => c.id === clinicId);
  const daysNumber = Number(days);
  const until = untilLabel(daysNumber);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await grantAccess({
        clinicId,
        planId: Number(planId),
        days: daysNumber,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        `Acesso liberado para ${chosen?.name ?? "a clínica"} até ${until}.`,
      );
      setClinicId("");
      setQuery("");
      setNote("");
    });
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="grant-clinic">Clínica</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="pl-9"
            aria-label="Buscar clínica"
          />
        </div>
        <select
          id="grant-clinic"
          className={selectClassName}
          value={clinicId}
          onChange={(e) => setClinicId(e.target.value)}
        >
          <option value="">
            {visible.length
              ? "Escolha a clínica"
              : "Nenhuma clínica encontrada"}
          </option>
          {visible.map((c) => (
            <option key={c.id} value={c.id} disabled={c.paid}>
              {c.name}
              {c.ownerEmail ? ` · ${c.ownerEmail}` : ""} ({c.status})
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          A clínica precisa ter criado a conta em /cadastro. Quem tem assinatura
          paga em dia aparece desativado.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="grant-plan">Plano</Label>
          <select
            id="grant-plan"
            className={selectClassName}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.quota.toLocaleString("pt-BR")} respostas da IA)
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="grant-days">Por quantos dias</Label>
          <div className="flex gap-2">
            {PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(String(d))}
                className={cn(
                  "rounded-full border px-3 text-sm transition-colors",
                  days === String(d)
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-accent/50",
                )}
              >
                {d}
              </button>
            ))}
            <Input
              id="grant-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-24"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {until ? `Vale até ${until}.` : "De 1 a 365 dias."}
          </p>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="grant-note">Observação (opcional)</Label>
        <Textarea
          id="grant-note"
          rows={2}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex.: demonstração combinada com a Dra. Ana"
        />
      </div>

      <FieldError message={error ?? undefined} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !clinicId || !planId}>
          {pending ? <Loader2 className="animate-spin" /> : <Gift />}
          Liberar acesso
        </Button>
      </div>
    </form>
  );
}

/** Acessos liberados, do mais novo para o mais antigo, com o botão de encerrar os que valem. */
export function GrantsTable({ rows }: { rows: GrantRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhum acesso liberado ainda.
      </p>
    );
  }
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[46rem] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-5 py-3 font-medium sm:pl-6">Clínica</th>
            <th className="px-3 py-3 font-medium">Plano</th>
            <th className="px-3 py-3 font-medium">Período</th>
            <th className="px-3 py-3 font-medium">Uso</th>
            <th className="px-3 py-3 font-medium">Situação</th>
            <th className="px-5 py-3 sm:pr-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const active = isFuture(r.end);
            return (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="px-5 py-3 sm:pl-6">
                  <Link
                    href={`/admin/clinicas/${r.clinicId}`}
                    className="font-medium hover:underline"
                  >
                    {r.clinicName}
                  </Link>
                  {(r.note || r.grantedBy) && (
                    <p className="text-xs text-muted-foreground">
                      {[r.note, r.grantedBy && `por ${r.grantedBy}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3">{r.planName}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {r.start ? date(r.start) : "—"} a {r.end ? date(r.end) : "—"}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {r.used.toLocaleString("pt-BR")} /{" "}
                  {r.quota.toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      active
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {active ? "Em vigor" : "Encerrado"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right sm:pr-6">
                  {active && <EndGrantButton id={r.id} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EndGrantButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return confirming ? (
    <span className="inline-flex gap-1">
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await endGrant(id);
            if (!result.ok) toast.error(result.error);
            setConfirming(false);
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        Encerrar agora
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Voltar
      </Button>
    </span>
  ) : (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      Encerrar
    </Button>
  );
}
