"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  AtSign,
  CheckCircle2,
  FileUp,
  Loader2,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  applySetup,
  readInstagramText,
  suggestSetup,
  type ApplySummary,
} from "@/app/(painel)/painel/preencher/actions";
import { PanelCard } from "@/components/painel/page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SetupSuggestion } from "@/lib/ai/autofill";
import { cn } from "@/lib/utils";

const MAX_CHARS = 20_000;
const DAYS = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const KIND_LABEL = {
  avaliacao: "Avaliação",
  procedimento: "Procedimento",
  livre: "Retorno/livre",
} as const;

type Picked = {
  businessInfo: boolean;
  services: boolean[];
  faqs: boolean[];
  professionals: boolean[];
  hours: boolean;
};

const pickAll = (s: SetupSuggestion): Picked => ({
  businessInfo: Boolean(s.businessInfo),
  services: s.services.map(() => true),
  faqs: s.faqs.map(() => true),
  professionals: s.professionals.map(() => true),
  hours: Boolean(s.hours),
});

export function SetupAutofill({ instagram }: { instagram: string | null }) {
  const [source, setSource] = useState("");
  const [suggestion, setSuggestion] = useState<SetupSuggestion | null>(null);
  const [businessInfo, setBusinessInfo] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [done, setDone] = useState<ApplySummary | null>(null);
  const [reading, startReading] = useTransition();
  const [loadingIg, startIg] = useTransition();
  const [saving, startSaving] = useTransition();

  function read() {
    startReading(async () => {
      const result = await suggestSetup(source);
      if (!result.ok) return void toast.error(result.error);
      const s = result.suggestion;
      const empty =
        !s.businessInfo &&
        !s.services.length &&
        !s.faqs.length &&
        !s.professionals.length &&
        !s.hours;
      if (empty) {
        toast.error(
          "A IA não encontrou nada para aproveitar nesse texto. Tente outro.",
        );
        return;
      }
      setSuggestion(s);
      setBusinessInfo(s.businessInfo);
      setPicked(pickAll(s));
      setDone(null);
    });
  }

  function loadInstagram() {
    startIg(async () => {
      const result = await readInstagramText();
      if (!result.ok) return void toast.error(result.error);
      setSource((prev) =>
        (prev.trim() ? `${prev.trim()}\n\n${result.text}` : result.text).slice(
          0,
          MAX_CHARS,
        ),
      );
      toast.success(
        "Texto do Instagram adicionado. Confira e clique em Ler com IA.",
      );
    });
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 500_000) {
      toast.error("Arquivo grande demais. Cole só a parte que importa.");
      return;
    }
    const text = (await file.text()).replace(/\r\n/g, "\n");
    setSource((prev) =>
      (prev.trim() ? `${prev.trim()}\n\n${text}` : text).slice(0, MAX_CHARS),
    );
  }

  function apply() {
    if (!suggestion || !picked) return;
    startSaving(async () => {
      const result = await applySetup({
        businessInfo: picked.businessInfo ? businessInfo.trim() : "",
        services: suggestion.services.filter((_, i) => picked.services[i]),
        faqs: suggestion.faqs.filter((_, i) => picked.faqs[i]),
        professionals: suggestion.professionals.filter(
          (_, i) => picked.professionals[i],
        ),
        hours: picked.hours ? suggestion.hours : null,
      });
      if (!result.ok) return void toast.error(result.error);
      setDone(result.summary);
      setSuggestion(null);
      setPicked(null);
    });
  }

  if (done) return <Done summary={done} onAgain={() => setDone(null)} />;

  if (suggestion && picked) {
    const toggle = (list: "services" | "faqs" | "professionals", i: number) =>
      setPicked({
        ...picked,
        [list]: picked[list].map((v, j) => (j === i ? !v : v)),
      });
    const count =
      Number(picked.businessInfo && Boolean(businessInfo.trim())) +
      picked.services.filter(Boolean).length +
      picked.faqs.filter(Boolean).length +
      picked.professionals.filter(Boolean).length +
      Number(picked.hours);

    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Confira o que a IA encontrou e desmarque o que não quiser. Nada é
          apagado: os itens entram junto com os que você já tem, e os repetidos
          ficam de fora.
        </p>

        {suggestion.businessInfo && (
          <Section
            title="Informações da clínica"
            hint="Vão para o fim do texto em Personalidade → Informações. Pode editar aqui."
            checked={picked.businessInfo}
            onCheck={() =>
              setPicked({ ...picked, businessInfo: !picked.businessInfo })
            }
          >
            <Textarea
              value={businessInfo}
              onChange={(e) => setBusinessInfo(e.target.value)}
              rows={8}
              maxLength={8000}
              disabled={!picked.businessInfo}
            />
          </Section>
        )}

        {suggestion.services.length > 0 && (
          <Section title={`Procedimentos (${suggestion.services.length})`}>
            <ItemList>
              {suggestion.services.map((s, i) => (
                <Item
                  key={s.name}
                  checked={picked.services[i]}
                  onCheck={() => toggle("services", i)}
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {s.durationMinutes} min · {KIND_LABEL[s.kind]}
                  </span>
                </Item>
              ))}
            </ItemList>
          </Section>
        )}

        {suggestion.faqs.length > 0 && (
          <Section title={`Perguntas frequentes (${suggestion.faqs.length})`}>
            <ItemList>
              {suggestion.faqs.map((f, i) => (
                <Item
                  key={f.question}
                  checked={picked.faqs[i]}
                  onCheck={() => toggle("faqs", i)}
                >
                  <span className="block font-medium">{f.question}</span>
                  <span className="block text-muted-foreground">
                    {f.answer}
                  </span>
                </Item>
              ))}
            </ItemList>
          </Section>
        )}

        {suggestion.professionals.length > 0 && (
          <Section title={`Profissionais (${suggestion.professionals.length})`}>
            <ItemList>
              {suggestion.professionals.map((n, i) => (
                <Item
                  key={n}
                  checked={picked.professionals[i]}
                  onCheck={() => toggle("professionals", i)}
                >
                  {n}
                </Item>
              ))}
            </ItemList>
          </Section>
        )}

        {suggestion.hours && (
          <Section
            title="Horário de atendimento"
            hint="Substitui os dias e o horário atuais. Feriados e datas fechadas não mudam."
            checked={picked.hours}
            onCheck={() => setPicked({ ...picked, hours: !picked.hours })}
          >
            <p className="text-sm">
              {suggestion.hours.workDays.map((d) => DAYS[d]).join(", ")} ·{" "}
              {suggestion.hours.start} às {suggestion.hours.end}
            </p>
          </Section>
        )}

        <div className="flex flex-wrap gap-3">
          <Button onClick={apply} disabled={saving || count === 0}>
            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Salvar {count} {count === 1 ? "item" : "itens"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSuggestion(null);
              setPicked(null);
            }}
            disabled={saving}
          >
            <RotateCcw />
            Voltar ao texto
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PanelCard>
      <div className="flex flex-wrap gap-2">
        {instagram && (
          <Button
            variant="outline"
            size="sm"
            onClick={loadInstagram}
            disabled={loadingIg || reading}
          >
            {loadingIg ? <Loader2 className="animate-spin" /> : <AtSign />}
            Usar o Instagram @{instagram}
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <label className="cursor-pointer">
            <FileUp />
            Abrir arquivo de texto
            <input
              type="file"
              accept=".txt,.md,.csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                void loadFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
      </div>
      <Textarea
        className="mt-4"
        value={source}
        onChange={(e) => setSource(e.target.value.slice(0, MAX_CHARS))}
        rows={14}
        placeholder={
          "Cole aqui o texto da clínica: tabela de preços, procedimentos, endereço, horários, perguntas que os pacientes fazem...\n\nPDF ou Word: abra o arquivo, selecione tudo (Ctrl+A), copie (Ctrl+C) e cole aqui."
        }
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {source.length.toLocaleString("pt-BR")} de{" "}
          {MAX_CHARS.toLocaleString("pt-BR")} caracteres. Não cole dados de
          pacientes.
        </span>
        <Button onClick={read} disabled={reading || source.trim().length < 30}>
          {reading ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {reading ? "Lendo..." : "Ler com IA"}
        </Button>
      </div>
    </PanelCard>
  );
}

function Section({
  title,
  hint,
  checked,
  onCheck,
  children,
}: {
  title: string;
  hint?: string;
  checked?: boolean;
  onCheck?: () => void;
  children: React.ReactNode;
}) {
  return (
    <PanelCard>
      <label
        className={cn(
          "flex items-center gap-3 font-display text-lg font-semibold",
          onCheck && "cursor-pointer",
        )}
      >
        {onCheck && (
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheck}
            className="size-4 accent-primary"
          />
        )}
        {title}
      </label>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </PanelCard>
  );
}

function ItemList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y rounded-lg border">{children}</ul>;
}

function Item({
  checked,
  onCheck,
  children,
}: {
  checked: boolean;
  onCheck: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <label
        className={cn(
          "flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent/40",
          !checked && "opacity-55",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span className="min-w-0 flex-1">{children}</span>
      </label>
    </li>
  );
}

function Done({
  summary,
  onAgain,
}: {
  summary: ApplySummary;
  onAgain: () => void;
}) {
  const links = [
    summary.businessInfo && {
      href: "/painel/assistente",
      text: "Informações da clínica atualizadas",
    },
    summary.services > 0 && {
      href: "/painel/procedimentos",
      text: `${summary.services} procedimento(s) adicionado(s)`,
    },
    summary.faqs > 0 && {
      href: "/painel/faqs",
      text: `${summary.faqs} pergunta(s) frequente(s) adicionada(s)`,
    },
    summary.professionals > 0 && {
      href: "/painel/profissionais",
      text: `${summary.professionals} profissional(is) adicionado(s)`,
    },
    summary.hours && {
      href: "/painel/horarios",
      text: "Horário de atendimento atualizado",
    },
  ].filter((l): l is { href: string; text: string } => Boolean(l));

  return (
    <PanelCard>
      <p className="flex items-center gap-2 font-display text-lg font-semibold">
        <CheckCircle2 className="size-5 text-emerald-500" />
        Pronto!
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-primary hover:underline">
              {l.text}
            </Link>
          </li>
        ))}
        {links.length === 0 && (
          <li className="text-muted-foreground">
            Tudo o que foi marcado já existia no painel.
          </li>
        )}
      </ul>
      {summary.skipped > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {summary.skipped} item(ns) ficaram de fora porque já existiam ou a
          lista chegou ao limite.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Vale conferir cada tela e fazer um teste na aba Testar assistente.
      </p>
      <Button variant="outline" className="mt-4" onClick={onAgain}>
        <Sparkles />
        Ler outro texto
      </Button>
    </PanelCard>
  );
}
