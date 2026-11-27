"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import {
  setAssistantActive,
  setChannelAssistant,
} from "@/app/(painel)/painel/actions";
import { Switch } from "@/components/ui/switch";

const CHANNEL_NAME = { whatsapp: "WhatsApp", instagram: "Instagram" } as const;

/**
 * Liga ou desliga a assistente, com a mudança aparecendo na hora. Sem `channel` é o botão geral
 * (todos os canais); com `channel`, pausa ou religa só aquele canal.
 */
export function AssistantToggle({
  active,
  disabled,
  channel,
}: {
  active: boolean;
  disabled: boolean;
  channel?: keyof typeof CHANNEL_NAME;
}) {
  const [optimistic, setOptimistic] = useOptimistic(active);
  const [pending, startTransition] = useTransition();
  const where = channel ? `no ${CHANNEL_NAME[channel]}` : "em todos os canais";

  return (
    <Switch
      checked={optimistic}
      disabled={disabled || pending}
      aria-label={`Assistente respondendo ${where}`}
      onCheckedChange={(value) =>
        startTransition(async () => {
          setOptimistic(value);
          const result = channel
            ? await setChannelAssistant(channel, value)
            : await setAssistantActive(value);
          if (!result.ok) toast.error(result.error);
          else
            toast.success(
              value
                ? `Assistente ligada: ela já responde ${where}.`
                : `Assistente pausada ${where}. A equipe responde manualmente.`,
            );
        })
      }
    />
  );
}
