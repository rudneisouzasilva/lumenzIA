"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { syncCronAppUrl } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";

export function SyncCronUrlButton({ url }: { url: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncCronAppUrl();
          if (!result.ok) toast.error(result.error);
          else toast.success(`Os jobs passam a chamar ${url}.`);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Fazer os jobs chamarem {url}
    </Button>
  );
}
