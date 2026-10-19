"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FlaskConical, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import { confirmMockPayment } from "@/app/(conta)/assinatura/actions";
import { Button } from "@/components/ui/button";

const cardClass =
  "rounded-2xl border bg-card p-8 text-center shadow-sm sm:p-10";

/** Confetes simples que caem a partir do ícone de sucesso. */
function Confetti() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const colors = ["var(--primary)", "var(--glow)", "#d946ef", "#10b981"];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10">
      {Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 size-2 rounded-sm"
            style={{ background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: Math.cos(angle) * (90 + (i % 3) * 30),
              y: Math.sin(angle) * 70 + 120,
              opacity: 0,
              rotate: 240,
            }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.15 }}
          />
        );
      })}
    </div>
  );
}

export function PaymentSuccess({
  planName,
  until,
}: {
  planName: string;
  until: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden ${cardClass}`}
    >
      <Confetti />
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 14 }}
        className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"
      >
        <CheckCircle2 className="size-9" />
      </motion.span>
      <h1 className="mt-6 font-display text-3xl font-semibold">
        Assinatura ativa!
      </h1>
      <p className="mt-3 text-muted-foreground">
        O {planName} está liberado até {until} e renova sozinho todo mês.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button asChild size="lg">
          <Link href="/painel/comecar">Configurar a assistente</Link>
        </Button>
        <Link
          href="/assinatura"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Ver minha assinatura
        </Link>
      </div>
    </motion.div>
  );
}

export function MockConfirm({
  subscriptionId,
  planName,
  price,
}: {
  subscriptionId: string;
  planName: string;
  price: string;
}) {
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await confirmMockPayment(subscriptionId);
      if (result && !result.ok) toast.error(result.error);
    });

  return (
    <div className={cardClass}>
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-glow/15 text-glow">
        <FlaskConical className="size-7" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-semibold">
        Pagamento de teste
      </h1>
      <p className="mt-2 text-muted-foreground">
        Este ambiente está no modo de teste: nada será cobrado. Confirme para
        simular a primeira cobrança do <strong>{planName}</strong> ({price}
        /mês).
      </p>
      <Button size="lg" className="mt-8" onClick={confirm} disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Confirmar pagamento de teste
      </Button>
      <p className="mt-4">
        <Link
          href="/assinatura"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Escolher outro plano
        </Link>
      </p>
    </div>
  );
}

const POLL_MS = 5000;
const MAX_POLLS = 36; // 3 minutos

/** Recarrega a página sozinha enquanto a primeira cobrança não é confirmada. */
export function WaitingConfirmation({ planName }: { planName: string }) {
  const router = useRouter();
  const [polls, setPolls] = useState(0);
  const gaveUp = polls >= MAX_POLLS;

  useEffect(() => {
    if (gaveUp) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      router.refresh();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [polls, gaveUp, router]);

  return (
    <div className={cardClass}>
      <div className="relative mx-auto size-16">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <span className="relative flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Loader2 className="size-8 animate-spin" />
        </span>
      </div>
      <h1 className="mt-6 font-display text-2xl font-semibold">
        Confirmando seu pagamento
      </h1>
      <p className="mt-2 text-muted-foreground">
        {gaveUp
          ? `O Mercado Pago ainda não confirmou a cobrança do ${planName}. Isso às vezes leva alguns minutos: assim que for aprovada, a assinatura é liberada sozinha.`
          : `Estamos aguardando o Mercado Pago aprovar a primeira cobrança do ${planName}. Esta página atualiza sozinha.`}
      </p>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/assinatura">Voltar para a assinatura</Link>
      </Button>
    </div>
  );
}
