"use client";

import { useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { generateInsightsAction } from "@/app/(painel)/painel/analise/actions";
import { Button } from "@/components/ui/button";

export function GenerateInsightsButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await generateInsightsAction();
          if (!result.ok) toast.error(result.error);
          else toast.success("Análise pronta.");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {pending ? "A IA está lendo os últimos 12 meses…" : label}
    </Button>
  );
}
