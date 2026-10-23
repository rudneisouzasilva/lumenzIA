import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Crown, UserCog } from "lucide-react";

import {
  ClinicNameForm,
  PasswordForm,
  ProfileForm,
} from "@/components/painel/account-forms";
import { PageHeader, PanelCard, PanelSkeleton } from "@/components/painel/page";
import { formatDate } from "@/lib/format";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = { title: "Minha conta" };

export default function AccountPage() {
  return (
    <>
      <PageHeader
        icon={UserCog}
        title="Minha conta"
        description="Seus dados de acesso e a clínica."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const { supabase, user, clinic, subscription } = await getPanelContext();
  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .single(),
    supabase
      .from("clinic_members")
      .select("user_id, role, profiles(full_name)")
      .eq("clinic_id", clinic.id)
      .order("created_at"),
  ]);
  const until = subscription.grace_until ?? subscription.current_period_end;

  return (
    <div className="space-y-6">
      <PanelCard title="Seus dados">
        <ProfileForm
          email={user.email ?? ""}
          initial={{
            fullName: profile?.full_name ?? "",
            phone: profile?.phone ?? "",
          }}
        />
      </PanelCard>

      <PanelCard title="Clínica">
        <ClinicNameForm
          initial={{ name: clinic.name }}
          canEdit={clinic.role === "owner"}
        />
        <div className="mt-6 border-t pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Equipe com acesso</p>
            {clinic.role === "owner" && (
              <Link
                href="/painel/equipe"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Convidar e escolher as telas
              </Link>
            )}
          </div>
          <ul className="divide-y rounded-xl border">
            {(members ?? []).map((m) => (
              <li
                key={m.user_id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 font-medium text-primary">
                    {(m.profiles?.full_name || "?").charAt(0).toUpperCase()}
                  </span>
                  {m.profiles?.full_name || "Sem nome"}
                  {m.user_id === user.id && (
                    <span className="text-muted-foreground">(você)</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {m.role === "owner" && (
                    <Crown className="size-3.5 text-glow" />
                  )}
                  {m.role === "owner" ? "Dona da conta" : "Equipe"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </PanelCard>

      <PanelCard title="Trocar senha">
        <PasswordForm />
      </PanelCard>

      <Link
        href="/assinatura"
        className="group flex items-center justify-between gap-4 rounded-2xl border bg-gradient-to-r from-primary/10 via-card to-glow/10 p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        <div>
          <p className="font-medium">{subscription.plans?.name ?? "Plano"}</p>
          <p className="text-sm text-muted-foreground">
            {subscription.messages_used_this_period.toLocaleString("pt-BR")} de{" "}
            {(subscription.plans?.message_quota ?? 0).toLocaleString("pt-BR")}{" "}
            mensagens neste ciclo
            {until && ` · válido até ${formatDate(until)}`}
          </p>
        </div>
        <span className="flex items-center gap-1 text-sm font-medium text-primary">
          Ver assinatura
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </div>
  );
}
