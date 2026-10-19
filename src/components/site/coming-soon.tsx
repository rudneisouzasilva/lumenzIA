"use client";

import {
  CalendarCheck,
  ChartLine,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";

const features = [
  { icon: MessageCircle, label: "Atende no WhatsApp 24 horas" },
  { icon: CalendarCheck, label: "Agenda e lembra os pacientes" },
  { icon: ChartLine, label: "Mostra o que os pacientes procuram" },
];

export function ComingSoon() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[36rem] -translate-1/2 rounded-full bg-primary/25 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-2/3 -z-10 size-72 rounded-full bg-glow/30 blur-3xl"
        animate={{ x: [0, -40, 0], y: [0, 30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.span
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card/60 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur"
      >
        <Sparkles className="size-4 text-primary" />
        Em construção
      </motion.span>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
      >
        A assistente de IA que ilumina o atendimento da sua clínica
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mt-6 max-w-xl text-lg text-pretty text-muted-foreground"
      >
        Responde dúvidas, envia fotos dos procedimentos, marca horários e chama
        a sua equipe quando precisa de um humano.
      </motion.p>

      <ul className="mt-12 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, label }, i) => (
          <motion.li
            key={label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 + i * 0.1 }}
            whileHover={{ y: -4 }}
            className="flex flex-col items-center gap-3 rounded-xl border bg-card/70 p-6 shadow-sm backdrop-blur"
          >
            <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" />
            </span>
            <span className="text-sm font-medium">{label}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
