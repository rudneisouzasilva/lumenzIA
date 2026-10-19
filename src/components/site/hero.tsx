"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { PhoneChat } from "@/components/site/phone-chat";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/site";

const ease = [0.21, 0.47, 0.32, 0.98] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* brilhos de fundo */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          className="absolute -top-40 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-40 right-[-8rem] size-96 rounded-full bg-glow/25 blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] [background-size:24px_24px]" />
      </div>

      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-14 pb-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-16">
        <div className="text-center lg:text-left">
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur"
          >
            <Sparkles className="size-4 text-primary" />
            Assistente de IA para clínicas de estética
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease }}
            className="mt-6 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Cada paciente respondido no WhatsApp{" "}
            <span className="bg-gradient-to-r from-primary via-fuchsia-500 to-glow bg-clip-text text-transparent">
              em segundos
            </span>
            , a qualquer hora.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease }}
            className="mx-auto mt-6 max-w-xl text-lg text-pretty text-muted-foreground lg:mx-0"
          >
            A LumenzIA fala como a sua clínica: tira dúvidas, envia as fotos que
            você aprovou, marca a avaliação na agenda e chama a equipe quando
            precisa de um humano.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease }}
            className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start"
          >
            <Button
              asChild
              size="lg"
              className="group h-12 px-7 text-base shadow-lg shadow-primary/25"
            >
              <Link href="/planos">
                Começar agora
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 px-7 text-base"
            >
              <a href={whatsappLink()} target="_blank" rel="noopener">
                Falar no WhatsApp
              </a>
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground lg:justify-start"
          >
            <ShieldCheck className="size-4 text-primary" />
            Você configura sem código e testa no painel antes de ligar.
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40, rotate: 2 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease }}
        >
          <PhoneChat />
        </motion.div>
      </div>
    </section>
  );
}
