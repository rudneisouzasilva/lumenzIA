import { Suspense } from "react";
import type { Metadata } from "next";
import { UsersRound } from "lucide-react";

import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import {
  InviteForm,
  MembersList,
  PendingInvites,
} from "@/components/painel/team-manager";
import { isArea, type Area } from "@/lib/painel/areas";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = { title: "Equipe" };

export default function TeamPage() {
  return (
    <>
      <PageHeader
        icon={UsersRound}
        title="Equipe"
        description="Convide quem trabalha com você e escolha quais telas do painel cada pessoa pode abrir. Você sempre vê tudo."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Team />
      </Suspense>
    </>
  );
}

const onlyAreas = (list: string[] | null) =>
  list === null ? null : list.filter(isArea);

async function Team() {
  const { supabase, user, clinic } = await getPanelContext();
  const [membersRes, invitesRes] = await Promise.all([
    supabase.rpc("clinic_member_emails", { p_clinic_id: clinic.id }),
    supabase
      .from("clinic_invites")
      .select("id, full_name, email, permissions, created_at, expires_at")
      .eq("clinic_id", clinic.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (invitesRes.error) throw new Error(invitesRes.error.message);

  return (
    <div className="space-y-6">
      <PanelCard
        title="Convidar pessoa"
        description="A pessoa recebe um link para criar a conta (ou entrar com a que já tem) e entra só nas telas marcadas."
      >
        <InviteForm />
      </PanelCard>

      {invitesRes.data.length > 0 && (
        <PanelCard title="Convites em aberto">
          <PendingInvites
            invites={invitesRes.data.map((i) => ({
              id: i.id,
              fullName: i.full_name,
              email: i.email,
              areas: i.permissions.filter(isArea) as Area[],
              expiresAt: i.expires_at,
            }))}
          />
        </PanelCard>
      )}

      <PanelCard title="Quem já faz parte">
        <MembersList
          currentUserId={user.id}
          members={membersRes.data.map((m) => ({
            userId: m.user_id,
            fullName: m.full_name,
            email: m.email,
            owner: m.role === "owner",
            areas: onlyAreas(m.permissions),
            lastSignInAt: m.last_sign_in_at,
          }))}
        />
      </PanelCard>
    </div>
  );
}
