"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Hand,
  Headset,
  ImagePlus,
  Inbox as InboxIcon,
  Loader2,
  MessageSquareOff,
  SendHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import {
  endConversation,
  returnToAi,
  sendStaffReply,
  takeConversation,
  type AttendanceResult,
} from "@/app/(painel)/painel/atendimento/actions";
import { Button } from "@/components/ui/button";
import {
  formatDateTime,
  formatPhone,
  formatRelative,
  formatTime,
} from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import type { Database } from "@/lib/supabase/database.types";
import { createRealtimeClient } from "@/lib/supabase/realtime";
import { cn } from "@/lib/utils";

type OpenRow =
  Database["public"]["Functions"]["attendance_inbox"]["Returns"][number];
type ClosedRow = {
  id: number;
  contact_phone: string;
  started_at: string;
  last_message_at: string;
  status: Database["public"]["Enums"]["conversation_status"];
  summary: string | null;
  contact_reasons: { name: string } | null;
};
type Message = {
  id: number;
  role: Database["public"]["Enums"]["message_role"];
  content: string;
  created_at: string;
  profiles: { full_name: string } | null;
  images: { storage_path: string; description: string } | null;
};
type Client = Awaited<ReturnType<typeof createRealtimeClient>>;
type ClinicImage = { id: string; url: string; description: string };

const TABS = [
  { key: "todas", label: "Em andamento" },
  { key: "pendente", label: "Precisam de você" },
  { key: "equipe", label: "Com a equipe" },
  { key: "ia", label: "Com a IA" },
  { key: "encerradas", label: "Encerradas" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const STATE = {
  pendente: {
    label: "Precisa de você",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    icon: Hand,
  },
  equipe: {
    label: "Com a equipe",
    className: "bg-primary/12 text-primary",
    icon: Headset,
  },
  ia: {
    label: "Com a IA",
    className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    icon: Sparkles,
  },
} as const;

const CLOSED_LABEL = { concluida: "Concluída", abandonada: "Não finalizada" };
const WINDOW_MS = 24 * 3600_000;

/**
 * Caixa de entrada no estilo WhatsApp Web: as conversas em andamento chegam sozinhas pelo
 * Realtime, e a equipe assume, responde, devolve para a IA ou encerra.
 */
export function Inbox({
  clinicId,
  whatsappConnected,
  initialConversationId,
  images,
}: {
  clinicId: string;
  whatsappConnected: boolean;
  initialConversationId: number | null;
  images: ClinicImage[];
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState<Tab>("todas");
  const [open, setOpen] = useState<OpenRow[] | null>(null);
  const [closed, setClosed] = useState<ClosedRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(
    initialConversationId,
  );
  // Mensagens guardadas junto com a conversa a que pertencem: trocar de conversa não mostra as
  // da anterior enquanto as novas carregam.
  const [thread, setThread] = useState<{ id: number; list: Message[] } | null>(
    null,
  );
  // Cada aviso do Realtime (ou a conferência periódica) só aumenta um número; os efeitos abaixo
  // buscam de novo quando ele muda.
  const [version, setVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [prevInitial, setPrevInitial] = useState(initialConversationId);

  // Um aviso do menu ("Abrir") muda o ?c= com a tela já aberta.
  if (initialConversationId !== prevInitial) {
    setPrevInitial(initialConversationId);
    if (initialConversationId) {
      setSelectedId(initialConversationId);
      setTab("todas");
    }
  }

  // "há 5 min" e a janela de 24 horas envelhecem sozinhos
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Conexão com o Realtime: conversas mudando e mensagens novas desta clínica.
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    void createRealtimeClient().then((supabase) => {
      if (cancelled) return;
      setClient(supabase);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const refreshSoon = () => {
        clearTimeout(timer);
        timer = setTimeout(() => setVersion((v) => v + 1), 300);
      };
      const channel = supabase
        .channel(`atendimento:${clinicId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `clinic_id=eq.${clinicId}`,
          },
          refreshSoon,
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `clinic_id=eq.${clinicId}`,
          },
          refreshSoon,
        )
        .subscribe((status) => setLive(status === "SUBSCRIBED"));
      // Rede de segurança se o Realtime cair: confere tudo de vez em quando.
      const poll = setInterval(() => setVersion((v) => v + 1), 60_000);

      cleanup = () => {
        clearTimeout(timer);
        clearInterval(poll);
        void supabase.removeChannel(channel);
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [clinicId]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client
      .rpc("attendance_inbox", { p_clinic_id: clinicId })
      .then(({ data, error }) => {
        if (error) console.error("[atendimento]", error.message);
        else if (active) setOpen(data);
      });
    return () => {
      active = false;
    };
  }, [client, clinicId, version]);

  useEffect(() => {
    if (!client || tab !== "encerradas") return;
    let active = true;
    void client
      .from("conversations")
      .select(
        "id, contact_phone, started_at, last_message_at, status, summary, contact_reasons(name)",
      )
      .eq("clinic_id", clinicId)
      .neq("status", "aberta")
      .order("last_message_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error("[atendimento]", error.message);
        else if (active) setClosed(data);
      });
    return () => {
      active = false;
    };
  }, [client, clinicId, tab, version]);

  useEffect(() => {
    if (!client || selectedId === null) return;
    let active = true;
    void client
      .from("messages")
      .select(
        "id, role, content, created_at, profiles(full_name), images(storage_path, description)",
      )
      .eq("conversation_id", selectedId)
      .order("id")
      .limit(500)
      .then(({ data, error }) => {
        if (error) console.error("[atendimento]", error.message);
        else if (active) setThread({ id: selectedId, list: data });
      });
    return () => {
      active = false;
    };
  }, [client, selectedId, version]);

  const messages = thread?.id === selectedId ? thread.list : [];
  const loadingMessages = selectedId !== null && thread?.id !== selectedId;

  const counts = useMemo(() => {
    const rows = open ?? [];
    return {
      todas: rows.length,
      pendente: rows.filter((r) => r.attendance_state === "pendente").length,
      equipe: rows.filter((r) => r.attendance_state === "equipe").length,
      ia: rows.filter((r) => r.attendance_state === "ia").length,
      encerradas: null,
    };
  }, [open]);

  const visibleOpen = useMemo(
    () =>
      (open ?? []).filter((r) => tab === "todas" || r.attendance_state === tab),
    [open, tab],
  );

  const selectedOpen = open?.find((r) => r.id === selectedId) ?? null;
  const selectedClosed = closed?.find((r) => r.id === selectedId) ?? null;

  const refresh = () => setVersion((v) => v + 1);

  return (
    <div className="space-y-4">
      {!whatsappConnected && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          O WhatsApp da clínica ainda não está conectado. As conversas aparecem
          aqui assim que o número for ligado; até lá, dá para assumir e
          devolver, mas não enviar mensagens.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Filtrar conversas"
          className="flex flex-wrap gap-1 rounded-xl border bg-card p-1"
        >
          {TABS.map((t) => {
            const count = counts[t.key];
            return (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  tab === t.key
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {count !== null && count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums",
                      t.key === "pendente"
                        ? "bg-amber-500 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <span
          className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"
          title={
            live
              ? "Novas mensagens aparecem sozinhas"
              : "Conectando ao tempo real…"
          }
        >
          <span className="relative flex size-2">
            {live && (
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
            )}
            <span
              className={cn(
                "relative size-2 rounded-full",
                live ? "bg-emerald-500" : "bg-muted-foreground/50",
              )}
            />
          </span>
          {live ? "Ao vivo" : "Conectando…"}
        </span>
      </div>

      <div className="grid h-[min(75vh,44rem)] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside
          className={cn(
            "min-h-0 flex-col border-r",
            selectedId !== null ? "hidden lg:flex" : "flex",
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "encerradas" ? (
              <ClosedList
                rows={closed}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : (
              <OpenList
                rows={open === null ? null : visibleOpen}
                tab={tab}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
          </div>
        </aside>

        <section
          className={cn(
            "min-h-0 min-w-0 flex-col",
            selectedId !== null ? "flex" : "hidden lg:flex",
          )}
        >
          {selectedId === null ? (
            <EmptyState />
          ) : (
            <ConversationView
              key={selectedId}
              conversationId={selectedId}
              open={selectedOpen}
              closed={selectedClosed}
              messages={messages}
              loading={loadingMessages}
              images={images}
              whatsappConnected={whatsappConnected}
              now={now}
              onBack={() => setSelectedId(null)}
              onChanged={refresh}
              onStateChange={(state) =>
                setOpen(
                  (rows) =>
                    rows?.map((r) =>
                      r.id === selectedId
                        ? {
                            ...r,
                            attendance_state: state,
                            needs_human_at:
                              state === "ia" ? null : r.needs_human_at,
                          }
                        : r,
                    ) ?? rows,
                )
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="animate-pulse divide-y" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex gap-3 px-4 py-3.5">
          <div className="size-10 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-32 rounded bg-muted" />
            <div className="h-3 w-48 rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ListEmpty({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      <InboxIcon className="size-8 opacity-40" />
      {text}
    </div>
  );
}

function Avatar({
  phone,
  state,
}: {
  phone: string;
  state?: keyof typeof STATE;
}) {
  return (
    <span
      className={cn(
        "relative grid size-10 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground",
      )}
    >
      {phone.slice(-2)}
      {state === "pendente" && (
        <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-amber-500 ring-2 ring-card" />
      )}
    </span>
  );
}

function OpenList({
  rows,
  tab,
  selectedId,
  onSelect,
}: {
  rows: OpenRow[] | null;
  tab: Tab;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const reduce = useReducedMotion();
  if (rows === null) return <ListSkeleton />;
  if (!rows.length) {
    return (
      <ListEmpty
        text={
          tab === "pendente"
            ? "Nenhum paciente esperando a equipe agora."
            : "Nenhuma conversa em andamento. Quando um paciente escrever no WhatsApp, ela aparece aqui na hora."
        }
      />
    );
  }
  return (
    <ul className="divide-y">
      <AnimatePresence initial={false}>
        {rows.map((r) => {
          const state = STATE[r.attendance_state];
          const Icon = state.icon;
          return (
            <motion.li
              key={r.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                aria-current={selectedId === r.id ? "true" : undefined}
                className={cn(
                  "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                  selectedId === r.id && "bg-primary/8",
                )}
              >
                <Avatar phone={r.contact_phone} state={r.attendance_state} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {formatPhone(r.contact_phone)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelative(r.last_message_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {r.last_role === "model" && "IA: "}
                    {r.last_role === "staff" && "Equipe: "}
                    {r.last_message ?? "…"}
                  </span>
                  <span
                    className={cn(
                      "mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                      state.className,
                    )}
                  >
                    <Icon className="size-3" />
                    {state.label}
                  </span>
                </span>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

function ClosedList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ClosedRow[] | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (rows === null) return <ListSkeleton />;
  if (!rows.length)
    return <ListEmpty text="Nenhuma conversa encerrada ainda." />;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onSelect(r.id)}
            aria-current={selectedId === r.id ? "true" : undefined}
            className={cn(
              "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50",
              selectedId === r.id && "bg-primary/8",
            )}
          >
            <Avatar phone={r.contact_phone} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {formatPhone(r.contact_phone)}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatRelative(r.last_message_at)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {r.summary ?? "Sem resumo"}
              </span>
              <span className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {r.status === "aberta"
                    ? "Em andamento"
                    : CLOSED_LABEL[r.status]}
                </span>
                {r.contact_reasons && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                    {r.contact_reasons.name}
                  </span>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-glow/15 text-primary ring-1 ring-primary/15">
        <Headset className="size-6" />
      </span>
      <p className="font-display text-lg font-semibold">Escolha uma conversa</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        As que precisam de você aparecem primeiro, com o selo amarelo. Você
        também pode assumir qualquer conversa da IA a qualquer momento.
      </p>
    </div>
  );
}

function ConversationView({
  conversationId,
  open,
  closed,
  messages,
  loading,
  images,
  whatsappConnected,
  now,
  onBack,
  onChanged,
  onStateChange,
}: {
  conversationId: number;
  open: OpenRow | null;
  closed: ClosedRow | null;
  messages: Message[];
  loading: boolean;
  images: ClinicImage[];
  whatsappConnected: boolean;
  now: number;
  onBack: () => void;
  onChanged: () => void;
  onStateChange: (state: "ia" | "equipe") => void;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"take" | "return" | "end" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const phone = open?.contact_phone ?? closed?.contact_phone ?? "";

  useEffect(() => {
    const el = scrollRef.current;
    if (el)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: reduce ? "auto" : "smooth",
      });
  }, [messages, reduce]);

  const run = (
    kind: "take" | "return" | "end",
    action: () => Promise<AttendanceResult>,
    success: string,
  ) => {
    setBusy(kind);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (!result.ok) {
        toast.error(result.error);
        onChanged();
        return;
      }
      if (kind === "take") onStateChange("equipe");
      if (kind === "return") onStateChange("ia");
      toast.success(success);
      onChanged();
    });
  };

  const lastPatientAt = open?.last_patient_message_at;
  const windowClosed =
    !lastPatientAt || now - Date.parse(lastPatientAt) > WINDOW_MS;

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 lg:hidden"
          onClick={onBack}
          aria-label="Voltar para a lista"
        >
          <ArrowLeft />
        </Button>
        <Avatar phone={phone || "··"} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            {phone ? formatPhone(phone) : "Conversa"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {open
              ? `Começou ${formatDateTime(open.started_at)} · ${open.message_count} mensagens`
              : closed
                ? [
                    closed.status === "aberta"
                      ? "Em andamento"
                      : CLOSED_LABEL[closed.status],
                    closed.contact_reasons?.name,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Esta conversa foi encerrada."}
          </p>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {open.attendance_state === "equipe" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    "return",
                    () => returnToAi(conversationId),
                    "A IA voltou a responder esta conversa.",
                  )
                }
              >
                {busy === "return" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Bot />
                )}
                Devolver para a IA
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(
                    "take",
                    () => takeConversation(conversationId),
                    "Você assumiu a conversa. A IA não responde mais até você devolver.",
                  )
                }
              >
                {busy === "take" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Hand />
                )}
                Assumir conversa
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              title="Encerrar agora e classificar o motivo do contato"
              onClick={() =>
                run(
                  "end",
                  () => endConversation(conversationId),
                  "Conversa encerrada.",
                )
              }
            >
              {busy === "end" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              Encerrar
            </Button>
          </div>
        )}
      </header>

      {open?.attendance_state === "pendente" && (
        <p className="flex items-center gap-2 border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          <Hand className="size-4 shrink-0" />A assistente pediu ajuda
          {open.needs_human_at ? ` ${formatRelative(open.needs_human_at)}` : ""}
          . Responda aqui ou assuma a conversa.
        </p>
      )}
      {closed?.summary && (
        <p className="border-b bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Resumo:</span>{" "}
          {closed.summary}
        </p>
      )}

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-[#efeae2] px-3 py-4 sm:px-6 dark:bg-[#0b141a]"
        aria-live="polite"
      >
        {loading && !messages.length ? (
          <Loader2 className="m-auto size-6 animate-spin text-neutral-500" />
        ) : (
          messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
      </div>

      {open ? (
        <Composer
          conversationId={conversationId}
          images={images}
          disabledReason={
            !whatsappConnected
              ? "O WhatsApp da clínica ainda não está conectado."
              : windowClosed
                ? "Passaram 24 horas desde a última mensagem do paciente. O WhatsApp só libera a resposta quando ele escrever de novo."
                : null
          }
          aiActive={open.attendance_state !== "equipe"}
          onSent={() => {
            onStateChange("equipe");
            onChanged();
          }}
        />
      ) : (
        <p className="flex items-center justify-center gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
          <MessageSquareOff className="size-4" />
          Conversa encerrada. Se o paciente escrever de novo, uma nova conversa
          começa.
        </p>
      )}
    </>
  );
}

function Bubble({ message: m }: { message: Message }) {
  const mine = m.role !== "user";
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-lg px-3 py-2 text-sm text-neutral-800 shadow-sm dark:text-neutral-100",
        mine
          ? "self-end rounded-tr-none"
          : "self-start rounded-tl-none bg-white dark:bg-[#202c33]",
        m.role === "model" && "bg-[#d9fdd3] dark:bg-[#005c4b]",
        m.role === "staff" && "bg-[#e7e0ff] dark:bg-[#3b2d6b]",
      )}
    >
      {m.role !== "user" && (
        <p
          className={cn(
            "mb-0.5 flex items-center gap-1 text-[11px] font-semibold",
            m.role === "model"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-violet-700 dark:text-violet-300",
          )}
        >
          {m.role === "model" ? (
            <Sparkles className="size-3" />
          ) : (
            <Headset className="size-3" />
          )}
          {m.role === "model"
            ? "Assistente"
            : m.profiles?.full_name || "Equipe"}
        </p>
      )}
      <p className="break-words whitespace-pre-wrap">{m.content}</p>
      {m.images && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={publicImageUrl(m.images.storage_path)}
          alt={m.images.description}
          className="mt-2 max-h-56 w-full rounded-md object-cover"
        />
      )}
      <span className="mt-1 block text-right text-[10px] text-neutral-500 dark:text-neutral-400">
        {formatTime(m.created_at)}
      </span>
    </div>
  );
}

function Composer({
  conversationId,
  images,
  disabledReason,
  aiActive,
  onSent,
}: {
  conversationId: number;
  images: ClinicImage[];
  disabledReason: string | null;
  aiActive: boolean;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<ClinicImage | null>(null);
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();
  const disabled = Boolean(disabledReason);

  const send = () => {
    const message = text.trim();
    if ((!message && !image) || pending || disabled) return;
    startTransition(async () => {
      const result = await sendStaffReply({
        conversationId,
        message,
        imageId: image?.id ?? null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setText("");
      setImage(null);
      setPicking(false);
      onSent();
    });
  };

  return (
    <div className="border-t bg-[#f0f2f5] dark:bg-[#202c33]">
      {disabledReason ? (
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          {disabledReason}
        </p>
      ) : (
        aiActive && (
          <p className="px-4 pt-3 text-xs text-muted-foreground">
            Ao enviar, você assume a conversa e a IA para de responder.
          </p>
        )
      )}

      {picking && images.length > 0 && (
        <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto px-3 pt-3 sm:grid-cols-6">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => {
                setImage(img);
                setPicking(false);
              }}
              title={img.description}
              className="overflow-hidden rounded-md ring-primary focus-visible:ring-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.description}
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {image && (
        <div className="flex items-center gap-2 px-3 pt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt=""
            className="size-10 rounded object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {image.description}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setImage(null)}
            aria-label="Tirar a foto"
          >
            <X />
          </Button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 px-3 py-3"
      >
        {images.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            disabled={disabled || pending}
            onClick={() => setPicking((v) => !v)}
            aria-label="Enviar uma foto da clínica"
            aria-expanded={picking}
          >
            <ImagePlus />
          </Button>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={4000}
          disabled={disabled}
          placeholder={
            disabled ? "Envio indisponível" : "Escreva como a clínica"
          }
          aria-label="Mensagem para o paciente"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-500 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 dark:bg-[#2a3942] dark:text-neutral-100"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || pending || (!text.trim() && !image)}
          aria-label="Enviar"
          className="size-10 shrink-0 rounded-full"
        >
          {pending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </form>
    </div>
  );
}
