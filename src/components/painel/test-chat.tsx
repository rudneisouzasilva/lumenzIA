"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  CalendarSearch,
  CalendarX2,
  CalendarCheck,
  CalendarClock,
  CheckCheck,
  Headset,
  RotateCcw,
  SendHorizontal,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import {
  testAssistant,
  type TestReply,
} from "@/app/(painel)/painel/testar/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PanelCard } from "./page";

type Reply = Extract<TestReply, { ok: true }>;

type Bubble =
  | { id: number; from: "user"; text: string; time: string }
  | {
      id: number;
      from: "model";
      text: string;
      time: string;
      images: Reply["images"];
      toolCalls: Reply["toolCalls"];
      needsHuman: boolean;
    };

const SUGGESTIONS = [
  "Oi! Quanto custa o botox?",
  "Vocês têm foto de antes e depois?",
  "Quero marcar uma avaliação para sexta",
  "Posso falar com uma pessoa?",
];

const TOOL_LABELS: Record<
  string,
  { label: string; icon: typeof CalendarClock }
> = {
  consultar_disponibilidade: {
    label: "Consultou horários livres",
    icon: CalendarSearch,
  },
  criar_agendamento: { label: "Marcou um agendamento", icon: CalendarCheck },
  consultar_agendamentos: {
    label: "Buscou os agendamentos do paciente",
    icon: CalendarClock,
  },
  cancelar_agendamento: {
    label: "Cancelou um agendamento",
    icon: CalendarX2,
  },
  agendar_retorno: {
    label: "Marcou uma retomada da conversa",
    icon: CalendarClock,
  },
};

const now = () =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

/** Conversa de teste no estilo do WhatsApp, com destaque quando a IA usa a agenda ou envia foto. */
export function TestChat({
  assistantName,
  clinicName,
  agendaConnected,
}: {
  assistantName: string;
  clinicName: string;
  agendaConnected: boolean;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = scrollRef.current;
    if (el)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: reduce ? "auto" : "smooth",
      });
  }, [bubbles, pending, reduce]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    if (message.length > 1000) {
      toast.error("Escreva uma mensagem de até 1000 caracteres.");
      return;
    }

    const history = bubbles.map((b) => ({ role: b.from, text: b.text }));
    const sentImageIds = bubbles.flatMap((b) =>
      b.from === "model" ? b.images.map((i) => i.id) : [],
    );
    setBubbles((list) => [
      ...list,
      { id: nextId.current++, from: "user", text: message, time: now() },
    ]);
    setInput("");

    startTransition(async () => {
      const result = await testAssistant({ message, history, sentImageIds });
      if (!result.ok) {
        toast.error(result.error);
        // devolve a mensagem para a caixa, para tentar de novo
        setBubbles((list) => list.slice(0, -1));
        setInput(message);
        return;
      }
      setBubbles((list) => [
        ...list,
        {
          id: nextId.current++,
          from: "model",
          text: result.reply,
          time: now(),
          images: result.images,
          toolCalls: result.toolCalls,
          needsHuman: result.needsHuman,
        },
      ]);
      inputRef.current?.focus();
    });
  };

  const reset = () => {
    setBubbles([]);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="overflow-hidden rounded-2xl border bg-[#efeae2] shadow-sm dark:bg-[#0b141a]">
        <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white dark:bg-[#202c33]">
          <div className="grid size-10 place-items-center rounded-full bg-white/20 font-semibold">
            {assistantName.trim().charAt(0).toUpperCase() || "A"}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold">{clinicName}</p>
            <p className="text-xs text-white/75">
              {pending ? "digitando..." : `${assistantName} · online`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={pending || bubbles.length === 0}
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <RotateCcw />
            Recomeçar
          </Button>
        </div>

        <div
          ref={scrollRef}
          className="flex h-[min(60vh,32rem)] flex-col gap-2 overflow-y-auto px-3 py-4 sm:px-5"
          aria-live="polite"
        >
          <p className="mx-auto mb-2 max-w-sm rounded-lg bg-[#fff5c4] px-3 py-1.5 text-center text-xs text-neutral-700 shadow-sm dark:bg-[#182229] dark:text-amber-200/80">
            Modo de teste: nada vai para o WhatsApp, nada é salvo e não conta na
            cota de mensagens.
          </p>

          {bubbles.length === 0 && (
            <div className="m-auto grid max-w-md gap-2 text-center">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                Escreva como se fosse um paciente. Algumas ideias:
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full bg-white px-3 py-1.5 text-xs text-neutral-700 shadow-sm transition-colors hover:bg-[#d9fdd3] dark:bg-[#202c33] dark:text-neutral-200 dark:hover:bg-[#005c4b]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {bubbles.map((b) => (
              <motion.div
                key={b.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm text-neutral-800 shadow-sm dark:text-neutral-100",
                  b.from === "model"
                    ? "self-start rounded-tl-none bg-white dark:bg-[#202c33]"
                    : "self-end rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b]",
                )}
              >
                {b.from === "model" && b.toolCalls.length > 0 && (
                  <ToolCalls calls={b.toolCalls} />
                )}
                <p className="whitespace-pre-wrap">{b.text}</p>
                {b.from === "model" &&
                  b.images.map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={img.id}
                      src={img.url}
                      alt={img.description}
                      className="mt-2 max-h-64 w-full rounded-md object-cover ring-2 ring-primary/40"
                    />
                  ))}
                {b.from === "model" && b.needsHuman && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <Headset className="size-3.5 shrink-0" />
                    No WhatsApp, a conversa iria para a fila de atendimento
                    humano e a equipe seria avisada.
                  </p>
                )}
                <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                  {b.time}
                  {b.from === "user" && (
                    <CheckCheck className="size-3 text-sky-500" />
                  )}
                </span>
              </motion.div>
            ))}
            {pending && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex gap-1 self-start rounded-lg rounded-tl-none bg-white px-3 py-3 shadow-sm dark:bg-[#202c33]"
                aria-label="Digitando"
              >
                {[0, 1, 2].map((d) => (
                  <motion.span
                    key={d}
                    className="size-1.5 rounded-full bg-neutral-400"
                    animate={reduce ? undefined : { y: [0, -4, 0] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: d * 0.15,
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 bg-[#f0f2f5] px-3 py-3 dark:bg-[#202c33]"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder="Digite uma mensagem"
            aria-label="Mensagem do paciente"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-sm text-neutral-800 outline-none placeholder:text-neutral-500 focus-visible:ring-2 focus-visible:ring-primary/50 dark:bg-[#2a3942] dark:text-neutral-100"
          />
          <Button
            type="submit"
            size="icon"
            disabled={pending || !input.trim()}
            aria-label="Enviar"
            className="size-10 shrink-0 rounded-full"
          >
            <SendHorizontal />
          </Button>
        </form>
      </div>

      <div className="grid content-start gap-6">
        <PanelCard title="Como funciona">
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li>
              A assistente usa o que está salvo no painel agora: informações,
              perguntas frequentes, fotos, horários e regras.
            </li>
            <li>
              Mudou alguma coisa? Salve na tela correspondente e clique em{" "}
              <strong className="text-foreground">Recomeçar</strong>.
            </li>
            <li>
              Quando ela pede ajuda da equipe, o aviso aparece em{" "}
              <span className="font-medium text-amber-700 dark:text-amber-300">
                amarelo
              </span>
              .
            </li>
          </ul>
        </PanelCard>
        <PanelCard title="Agenda">
          <p className="text-sm text-muted-foreground">
            {agendaConnected
              ? "A agenda está conectada. Aqui no teste ela é só simulada: você vê o que a assistente consultaria ou marcaria, sem mexer na agenda de verdade."
              : "A agenda ainda não está conectada, então a assistente não consulta horários. A equipe LumenzIA faz essa conexão para você."}
          </p>
        </PanelCard>
      </div>
    </div>
  );
}

function ToolCalls({ calls }: { calls: Reply["toolCalls"] }) {
  return (
    <div className="mb-2 grid gap-1.5">
      {calls.map((call, i) => {
        const tool = TOOL_LABELS[call.name] ?? {
          label: call.name,
          icon: CalendarClock,
        };
        const Icon = tool.icon;
        const details = Object.entries(call.args)
          .filter(([, v]) => v !== "" && v != null)
          .map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`)
          .join(" · ");
        return (
          <div
            key={i}
            className="rounded-md bg-primary/10 px-2 py-1.5 text-xs text-primary"
          >
            <p className="flex items-center gap-1.5 font-medium">
              <Icon className="size-3.5 shrink-0" />
              {tool.label}
              <span className="font-normal opacity-70">(simulado)</span>
            </p>
            {details && <p className="mt-0.5 opacity-80">{details}</p>}
          </div>
        );
      })}
    </div>
  );
}
