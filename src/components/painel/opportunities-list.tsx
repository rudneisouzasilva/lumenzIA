"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, MessageSquare, SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhone, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

import { FollowUpDialog } from "./follow-ups-manager";
import { PanelCard } from "./page";
import {
  TemplateSendDialog,
  type ApprovedTemplate,
  type ClinicInfo,
} from "./template-send-dialog";

export type Opportunity = {
  contactId: string;
  phone: string;
  name: string | null;
  stage: string | null;
  lastContactAt: string;
  conversations: number;
  lastStatus: string;
  reason: string | null;
  summary: string | null;
  conversationId: number;
  score: number;
};

/** A nota (de 3 a ~15) vira três níveis fáceis de ler. */
function level(score: number) {
  if (score >= 10)
    return {
      label: "Muito promissor",
      css: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    };
  if (score >= 7)
    return {
      label: "Promissor",
      css: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    };
  return { label: "Vale tentar", css: "bg-muted text-muted-foreground" };
}

export function OpportunitiesList({
  items,
  templates,
  clinic,
  whatsappConnected,
}: {
  items: Opportunity[];
  templates: ApprovedTemplate[];
  clinic: ClinicInfo;
  whatsappConnected: boolean;
}) {
  const router = useRouter();
  const [sending, setSending] = useState<Opportunity | null>(null);
  const [scheduling, setScheduling] = useState<Opportunity | null>(null);

  if (!items.length) {
    return (
      <PanelCard>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ninguém para chamar agora. Quando alguém conversar e não agendar, ele
          aparece aqui alguns dias depois.
        </p>
      </PanelCard>
    );
  }

  return (
    <>
      <ul className="grid gap-3">
        {items.map((o) => {
          const l = level(o.score);
          return (
            <li
              key={o.contactId}
              className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {o.name ?? formatPhone(o.phone)}{" "}
                    <span
                      className={cn(
                        "ml-1 inline-flex rounded-full px-2 py-0.5 align-middle text-[11px] font-medium",
                        l.css,
                      )}
                    >
                      {l.label}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      o.name ? formatPhone(o.phone) : null,
                      o.stage,
                      o.reason,
                      `último contato ${formatRelative(o.lastContactAt)}`,
                      o.conversations > 1
                        ? `${o.conversations} conversas`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/painel/atendimento?c=${o.conversationId}`}>
                      <MessageSquare />
                      Conversa
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setScheduling(o)}
                  >
                    <CalendarPlus />
                    Marcar retomada
                  </Button>
                  <Button
                    size="sm"
                    disabled={!whatsappConnected}
                    onClick={() => setSending(o)}
                  >
                    <SendHorizontal />
                    Chamar agora
                  </Button>
                </div>
              </div>
              {o.summary && (
                <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                  {o.summary}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {sending && (
        <TemplateSendDialog
          open
          onOpenChange={(open) => !open && setSending(null)}
          templates={templates}
          clinic={clinic}
          phone={sending.phone}
          contactName={sending.name}
          onSent={(conversationId) =>
            router.push(`/painel/atendimento?c=${conversationId}`)
          }
        />
      )}
      {scheduling && (
        <FollowUpDialog
          title={`Retomada: ${scheduling.name ?? formatPhone(scheduling.phone)}`}
          initialPhone={scheduling.phone}
          onClose={() => {
            setScheduling(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
