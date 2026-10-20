"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessagesSquare, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { Inbox } from "./inbox";
import { usePendingCount } from "./pending-watcher";

type InboxProps = Omit<
  React.ComponentProps<typeof Inbox>,
  "compact" | "initialConversationId"
>;

/**
 * Bola de chat no canto de todas as telas do painel: abre a caixa de entrada numa janela lateral,
 * para a equipe responder sem sair do que está fazendo. Na própria tela de Conversas ela some.
 */
export function ChatLauncher(props: InboxProps) {
  const pathname = usePathname();
  const pending = usePendingCount();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/painel/atendimento")) return null;

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            type="button"
            onClick={() => setOpen(true)}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            aria-label={
              pending
                ? `Abrir conversas (${pending} esperando a equipe)`
                : "Abrir conversas"
            }
            className="fixed right-5 bottom-5 z-40 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30"
          >
            <MessagesSquare className="size-6" />
            {pending > 0 && (
              <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white tabular-nums ring-2 ring-background">
                {pending}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          className={cn(
            "top-auto right-0 bottom-0 left-auto flex h-[min(92svh,46rem)] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-3 rounded-b-none p-3 sm:right-5 sm:bottom-5 sm:max-w-md sm:rounded-2xl",
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          )}
        >
          <div className="flex items-center justify-between px-1">
            <DialogTitle className="font-display text-lg">
              Conversas
            </DialogTitle>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Inbox {...props} compact initialConversationId={null} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
