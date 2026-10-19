"use client";

import { CalendarCheck, MessageCircleHeart, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";

import { LogoMark } from "@/components/site/logo";

const ease = [0.21, 0.47, 0.32, 0.98] as const;

const highlights = [
  {
    icon: MessageCircleHeart,
    title: "Responde em segundos",
    text: "Dúvidas, preços e fotos no WhatsApp, a qualquer hora.",
  },
  {
    icon: CalendarCheck,
    title: "Agenda sozinha",
    text: "Marca avaliações e envia lembrete antes do horário.",
  },
  {
    icon: ShieldCheck,
    title: "Sua equipe no controle",
    text: "Assuma a conversa quando quiser, com um clique.",
  },
];

/** Painel ilustrado do lado esquerdo das telas de login e cadastro. */
export function AuthShowcase() {
  return (
    <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary via-fuchsia-600 to-primary text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
      <motion.div
        aria-hidden
        className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-glow/40 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-white/15 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.18)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent)] [background-size:22px_22px]"
      />

      <div className="relative flex items-center gap-2 font-display text-xl font-semibold">
        <LogoMark className="size-8" />
        LumenzIA
      </div>

      <div className="relative max-w-md">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease }}
          className="font-display text-4xl leading-tight font-semibold text-balance"
        >
          Sua clínica atendendo no WhatsApp enquanto você cuida dos pacientes.
        </motion.h2>

        <ul className="mt-10 space-y-5">
          {highlights.map(({ icon: Icon, title, text }, i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.12, ease }}
              className="flex gap-4"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="text-sm text-white/75">{text}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      </div>

      <div className="relative max-w-sm space-y-2 text-sm" aria-hidden>
        {[
          {
            me: false,
            text: "Oi! Tem horário amanhã para avaliação?",
            time: "23:12",
          },
          {
            me: true,
            text: "Tenho às 10h ou às 15h 😊 Qual prefere?",
            time: "23:12",
          },
        ].map((m, i) => (
          <motion.div
            key={m.text}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.7 + i * 0.5, ease }}
            className={
              m.me
                ? "ml-10 rounded-2xl rounded-tr-sm bg-white px-4 py-2.5 text-zinc-900 shadow-lg"
                : "mr-10 rounded-2xl rounded-tl-sm border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md"
            }
          >
            {m.text}
            <span className="ml-2 align-bottom text-[0.7rem] opacity-60">
              {m.time}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
