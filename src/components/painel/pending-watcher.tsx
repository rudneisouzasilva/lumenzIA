"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { formatPhone } from "@/lib/format";
import { createRealtimeClient } from "@/lib/supabase/realtime";

// Quantas conversas esperam alguém da equipe: um número só, lido pelo menu lateral.
let pending = 0;
const listeners = new Set<() => void>();

function setPending(value: number) {
  pending = value;
  listeners.forEach((l) => l());
}

/** Conversas pedindo atendimento humano agora (para o selo no menu). */
export function usePendingCount() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending,
    () => 0,
  );
}

/**
 * Fica de olho, em qualquer tela do painel, nas conversas que a IA passou para a equipe: atualiza
 * o selo do menu e avisa com um toast quando uma nova chega.
 */
export function PendingWatcher({ clinicId }: { clinicId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  // Na própria caixa de entrada o aviso seria repetido: a fila já aparece na tela.
  const onInbox = useRef(false);
  useEffect(() => {
    onInbox.current = pathname.startsWith("/painel/atendimento");
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    const notified = new Set<string>();

    void createRealtimeClient().then((supabase) => {
      if (cancelled) return;
      const recount = async () => {
        const { count } = await supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .eq("status", "aberta")
          .eq("attendance_state", "pendente");
        if (!cancelled) setPending(count ?? 0);
      };
      void recount();

      const channel = supabase
        .channel(`pendentes:${clinicId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `clinic_id=eq.${clinicId}`,
          },
          (payload) => {
            void recount();
            const row = payload.new as {
              id?: number;
              contact_phone?: string;
              channel?: string;
              attendance_state?: string;
              status?: string;
              needs_human_at?: string | null;
            };
            if (
              row.attendance_state !== "pendente" ||
              row.status !== "aberta" ||
              !row.needs_human_at ||
              Date.now() - Date.parse(row.needs_human_at) > 120_000
            )
              return;
            const key = `${row.id}:${row.needs_human_at}`;
            if (notified.has(key)) return;
            notified.add(key);
            if (onInbox.current) return;
            toast.warning("Um paciente precisa de atendimento", {
              description:
                row.channel === "instagram"
                  ? "Pelo Instagram"
                  : row.contact_phone
                    ? formatPhone(row.contact_phone)
                    : undefined,
              duration: 15_000,
              action: {
                label: "Abrir",
                onClick: () => router.push(`/painel/atendimento?c=${row.id}`),
              },
            });
          },
        )
        .subscribe();
      // Se o Realtime cair, o selo ainda se corrige sozinho de tempos em tempos.
      const timer = setInterval(recount, 60_000);
      cleanup = () => {
        clearInterval(timer);
        void supabase.removeChannel(channel);
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [clinicId, router]);

  return null;
}
