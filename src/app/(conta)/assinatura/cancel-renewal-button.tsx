"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { cancelRenewal } from "./actions";

/** Cancelar pede confirmação na própria tela (sem janela do navegador). */
export function CancelRenewalButton({ until }: { until: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelRenewal();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Renovação cancelada. Seu acesso continua até ${until}.`);
      setConfirming(false);
      router.refresh();
    });

  return (
    <AnimatePresence mode="wait" initial={false}>
      {confirming ? (
        <motion.div
          key="confirm"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm text-muted-foreground">
            Cancelar a renovação? O acesso segue até {until}.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Manter
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={cancel}
            disabled={pending}
          >
            {pending && <Loader2 className="animate-spin" />}
            Sim, cancelar
          </Button>
        </motion.div>
      ) : (
        <motion.div key="idle" exit={{ opacity: 0 }}>
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Cancelar renovação
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
