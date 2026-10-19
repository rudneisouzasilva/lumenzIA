"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { setAssistantActive } from "@/app/(painel)/painel/actions";
import { Switch } from "@/components/ui/switch";

/** Liga ou desliga a assistente no WhatsApp, com a mudança aparecendo na hora. */
export function AssistantToggle({
  active,
  disabled,
}: {
  active: boolean;
  disabled: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(active);
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={optimistic}
      disabled={disabled || pending}
      aria-label="Assistente respondendo no WhatsApp"
      onCheckedChange={(value) =>
        startTransition(async () => {
          setOptimistic(value);
          const result = await setAssistantActive(value);
          if (!result.ok) toast.error(result.error);
          else
            toast.success(
              value
                ? "Assistente ligada: ela já responde no WhatsApp."
                : "Assistente pausada. A equipe responde manualmente.",
            );
        })
      }
    />
  );
}
