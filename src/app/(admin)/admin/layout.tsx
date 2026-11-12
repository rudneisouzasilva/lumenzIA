import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { AdminShell, ClinicPanelLink } from "@/components/admin/shell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Equipe", template: "%s · Equipe LumenzIA" },
  robots: { index: false },
};

// Quem não é da equipe recebe 404 em cada página (getAdminContext), dentro do <Suspense> dela.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AdminShell
      clinicLink={
        <Suspense fallback={null}>
          <ClinicLinkIfMember />
        </Suspense>
      }
    >
      {children}
    </AdminShell>
  );
}

/** Só mostra "Painel da clínica" quando o login da equipe também participa de uma clínica. */
async function ClinicLinkIfMember() {
  // Só na hora do pedido: no build não há sessão (nem, no CI, as variáveis do Supabase).
  await connection();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;
  const { count } = await supabase
    .from("clinic_members")
    .select("clinic_id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ? <ClinicPanelLink /> : null;
}
