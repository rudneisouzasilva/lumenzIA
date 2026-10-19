"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck, CheckCheck, ImageIcon } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

type ChatMessage = {
  from: "paciente" | "ia";
  text: string;
  time: string;
  kind?: "photo" | "booking";
};

// Conversa de exemplo (fictícia) que se "digita" sozinha no celular da home.
const script: ChatMessage[] = [
  {
    from: "paciente",
    text: "Oi! Vocês fazem preenchimento labial? Quanto custa?",
    time: "22:47",
  },
  {
    from: "ia",
    text: "Oi, tudo bem? 😊 Fazemos sim! Cada caso pede uma quantidade diferente, então o valor é confirmado na avaliação.",
    time: "22:47",
  },
  {
    from: "ia",
    text: "Separei um exemplo de resultado natural para você ver.",
    time: "22:47",
    kind: "photo",
  },
  { from: "paciente", text: "Amei! Tem horário essa semana?", time: "22:48" },
  {
    from: "ia",
    text: "Tenho quinta às 15h ou sexta às 10h. Qual fica melhor?",
    time: "22:48",
  },
  { from: "paciente", text: "Quinta às 15h 🙌", time: "22:48" },
  {
    from: "ia",
    text: "Prontinho! Avaliação marcada para quinta, 15h. Mando um lembrete um dia antes.",
    time: "22:49",
    kind: "booking",
  },
];

const TYPING_MS = 1100;
const READ_MS = 1500;
const RESTART_MS = 4500;

export function PhoneChat() {
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Avança a conversa uma mensagem por vez; as da IA aparecem depois do "digitando...".
  useEffect(() => {
    if (reduceMotion) return;
    let timer: ReturnType<typeof setTimeout>;

    if (count >= script.length) {
      timer = setTimeout(() => setCount(0), RESTART_MS);
    } else if (script[count].from === "ia" && !typing) {
      timer = setTimeout(
        () => setTyping(true),
        count === 0 ? 600 : READ_MS / 2,
      );
    } else if (typing) {
      timer = setTimeout(() => {
        setTyping(false);
        setCount((c) => c + 1);
      }, TYPING_MS);
    } else {
      timer = setTimeout(
        () => setCount((c) => c + 1),
        count === 0 ? 600 : READ_MS,
      );
    }
    return () => clearTimeout(timer);
  }, [count, typing, reduceMotion]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
  }, [count, typing, reduceMotion]);

  // Leve inclinação 3D seguindo o mouse
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), {
    stiffness: 120,
    damping: 15,
  });
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), {
    stiffness: 120,
    damping: 15,
  });

  // Com "reduzir movimento" ligado, mostra a conversa inteira de uma vez.
  const visible = reduceMotion ? script : script.slice(0, count);

  return (
    <div
      className="relative mx-auto w-full max-w-[22rem] [perspective:1200px]"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <motion.div
        style={{ rotateX, rotateY }}
        className="relative rounded-[2.75rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl shadow-primary/25 dark:border-neutral-800"
        role="img"
        aria-label="Exemplo de conversa: a assistente responde sobre preenchimento labial, envia uma foto e marca a avaliação."
      >
        <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-neutral-900 dark:bg-neutral-800" />
        <div
          className="overflow-hidden rounded-[2.1rem] bg-[#efeae2] dark:bg-[#0b141a]"
          aria-hidden
        >
          <div className="flex items-center gap-3 bg-[#075e54] px-4 pt-9 pb-3 text-white dark:bg-[#202c33]">
            <div className="grid size-9 place-items-center rounded-full bg-white/20 text-sm font-semibold">
              A
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Clínica Aurora</p>
              <p className="text-xs text-white/75">
                {typing ? "digitando..." : "online"}
              </p>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex h-[22rem] flex-col gap-2 overflow-hidden px-3 py-4 sm:h-[26rem]"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((m, i) => (
                <motion.div
                  key={`${i}-${m.time}-${m.from}`}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  className={
                    m.from === "ia"
                      ? "max-w-[85%] self-start rounded-lg rounded-tl-none bg-white px-3 py-2 text-[13px] text-neutral-800 shadow-sm dark:bg-[#202c33] dark:text-neutral-100"
                      : "max-w-[85%] self-end rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 py-2 text-[13px] text-neutral-800 shadow-sm dark:bg-[#005c4b] dark:text-neutral-100"
                  }
                >
                  {m.kind === "photo" && (
                    <div className="mb-2 grid h-28 place-items-center rounded-md bg-gradient-to-br from-rose-200 via-primary/30 to-amber-100 text-neutral-600 dark:from-rose-900/60 dark:via-primary/30 dark:to-amber-900/40 dark:text-neutral-300">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                  <p>{m.text}</p>
                  {m.kind === "booking" && (
                    <div className="mt-2 flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary">
                      <CalendarCheck className="size-4" /> Quinta · 15:00 ·
                      Avaliação
                    </div>
                  )}
                  <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                    {m.time}
                    {m.from === "paciente" && (
                      <CheckCheck className="size-3 text-sky-500" />
                    )}
                  </span>
                </motion.div>
              ))}
              {typing && (
                <motion.div
                  key="typing"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex gap-1 self-start rounded-lg rounded-tl-none bg-white px-3 py-3 shadow-sm dark:bg-[#202c33]"
                >
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className="size-1.5 rounded-full bg-neutral-400"
                      animate={{ y: [0, -4, 0] }}
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
        </div>
      </motion.div>
    </div>
  );
}
