"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  FlaskConical,
  Images,
  Loader2,
  MessageCircleQuestion,
  PartyPopper,
  Sparkles,
  Store,
  Stethoscope,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import { saveListItem } from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { IdentityForm, KnowledgeForm } from "./assistant-forms";
import { HoursForm, type Hours } from "./hours-form";

const STEPS = [
  { title: "Sua assistente", icon: Sparkles },
  { title: "Sobre a clínica", icon: Store },
  { title: "Horários", icon: CalendarClock },
  { title: "Perguntas frequentes", icon: MessageCircleQuestion },
];

/** Passo a passo depois da assinatura, para não cair num painel vazio. */
export function Onboarding({
  identity,
  businessInfo,
  hours,
}: {
  identity: { assistantName: string; tone: string };
  businessInfo: string;
  hours: Hours;
}) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduce = useReducedMotion();
  const finished = step >= STEPS.length;

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const next = () => go(step + 1);

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Progresso">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={s.title} className="min-w-0">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-glow"
                  initial={false}
                  animate={{
                    width: i < step ? "100%" : i === step ? "50%" : "0%",
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <p
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "mt-2 hidden items-center gap-1.5 truncate text-xs sm:flex",
                  state === "todo"
                    ? "text-muted-foreground"
                    : "text-foreground",
                  state === "current" && "font-medium text-primary",
                )}
              >
                {state === "done" ? (
                  <Check className="size-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <Icon className="size-3.5 shrink-0" />
                )}
                {s.title}
              </p>
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={step}
          custom={direction}
          initial={reduce ? false : { opacity: 0, x: 24 * direction }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0, x: -24 * direction }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
        >
          {!finished && (
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-primary">
                  Passo {step + 1} de {STEPS.length}
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold">
                  {
                    [
                      "Como sua assistente vai se apresentar?",
                      "O que ela precisa saber da clínica?",
                      "Quando a clínica atende?",
                      "Quais dúvidas mais chegam no WhatsApp?",
                    ][step]
                  }
                </h2>
              </div>
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => go(step - 1)}
                  className="shrink-0"
                >
                  <ArrowLeft />
                  Voltar
                </Button>
              )}
            </div>
          )}

          {step === 0 && (
            <IdentityForm
              initial={identity}
              submitLabel="Continuar"
              onSaved={next}
            />
          )}
          {step === 1 && (
            <KnowledgeForm
              initial={{ businessInfo }}
              submitLabel="Continuar"
              onSaved={next}
            />
          )}
          {step === 2 && (
            <HoursForm
              initial={hours}
              showReminder={false}
              submitLabel="Continuar"
              onSaved={next}
            />
          )}
          {step === 3 && <QuickFaqs onDone={next} />}
          {finished && <Done />}
        </motion.div>
      </AnimatePresence>

      {!finished && (
        <p className="mt-4 text-center">
          <button
            type="button"
            onClick={next}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Pular este passo
          </button>
        </p>
      )}
    </div>
  );
}

const STARTER_QUESTIONS = [
  "Quais as formas de pagamento?",
  "Onde fica a clínica?",
  "A avaliação é gratuita?",
];

function QuickFaqs({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState(
    STARTER_QUESTIONS.map((question) => ({ question, answer: "" })),
  );
  const [pending, startTransition] = useTransition();
  const filled = rows.filter((r) => r.question.trim() && r.answer.trim());

  const save = () =>
    startTransition(async () => {
      for (const row of filled) {
        const result = await saveListItem("faqs", null, row);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
      }
      onDone();
    });

  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted-foreground">
        Responda do jeito que a clínica responderia. Dá para mudar e adicionar
        mais depois.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="grid gap-2 rounded-xl border p-4">
          <Input
            aria-label={`Pergunta ${i + 1}`}
            value={row.question}
            maxLength={500}
            onChange={(e) =>
              setRows((r) =>
                r.map((x, j) =>
                  j === i ? { ...x, question: e.target.value } : x,
                ),
              )
            }
            className="font-medium"
          />
          <Textarea
            aria-label={`Resposta ${i + 1}`}
            placeholder="Resposta"
            value={row.answer}
            maxLength={2000}
            onChange={(e) =>
              setRows((r) =>
                r.map((x, j) =>
                  j === i ? { ...x, answer: e.target.value } : x,
                ),
              )
            }
            className="min-h-16"
          />
        </div>
      ))}
      <div className="flex justify-end">
        <Button onClick={save} disabled={pending || filled.length === 0}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar e concluir
        </Button>
      </div>
    </div>
  );
}

function Done() {
  const next = [
    {
      href: "/painel/procedimentos",
      label: "Procedimentos",
      icon: Stethoscope,
    },
    { href: "/painel/fotos", label: "Fotos", icon: Images },
    {
      href: "/painel/faqs",
      label: "Mais perguntas",
      icon: MessageCircleQuestion,
    },
  ];
  return (
    <div className="text-center">
      <motion.span
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 14 }}
        className="mx-auto flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-glow/30 text-primary"
      >
        <PartyPopper className="size-8" />
      </motion.span>
      <h2 className="mt-5 font-display text-2xl font-semibold">
        O básico está pronto!
      </h2>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        Sua assistente já sabe se apresentar, conhece a clínica e os horários.
        Para ela agendar e enviar fotos, complete também:
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {next.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm"
          >
            <Icon className="size-5 text-primary" />
            {label}
          </Link>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/painel/testar">
            <FlaskConical />
            Testar a assistente
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/painel">Ir para a visão geral</Link>
        </Button>
      </div>
    </div>
  );
}
