import Link from "next/link";

import { formatDateTime } from "@/lib/format";

export type AuditEntry = {
  id: number;
  action: string;
  details: string;
  createdAt: string;
  who: string | null;
  clinic?: { id: string; name: string } | null;
};

const ACTIONS: Record<string, string> = {
  "whatsapp.conectado": "WhatsApp conectado",
  "whatsapp.desconectado": "WhatsApp desconectado",
  "whatsapp.removido_na_meta": "Removido na Meta",
  "whatsapp.editado": "WhatsApp editado",
  "templates.editado": "Templates editados",
  "agenda.editada": "Agenda editada",
  "assistente.ligada": "Assistente ligada",
  "assistente.pausada": "Assistente pausada",
  "jobs.endereco": "Endereço dos jobs",
};

/** Linha do tempo da auditoria (o texto nunca contém o valor de um segredo). */
export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhuma ação registrada ainda.
      </p>
    );
  }
  return (
    <ol className="relative space-y-5 border-l pl-5">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full bg-primary ring-4 ring-card"
          />
          <p className="text-sm">
            <span className="font-medium">{ACTIONS[e.action] ?? e.action}</span>
            {e.clinic && (
              <>
                {" · "}
                <Link
                  href={`/admin/clinicas/${e.clinic.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {e.clinic.name}
                </Link>
              </>
            )}
          </p>
          {e.details && (
            <p className="mt-0.5 text-sm break-words text-muted-foreground">
              {e.details}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(e.createdAt)} · {e.who ?? "Sistema"}
          </p>
        </li>
      ))}
    </ol>
  );
}
