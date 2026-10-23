import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { TriangleAlert } from "lucide-react";

import { AuthHeading, FormSkeleton } from "@/components/auth/auth-heading";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { AREAS, isArea } from "@/lib/painel/areas";
import { findInvite } from "@/lib/painel/invites";
import { createClient } from "@/lib/supabase/server";

import { AcceptButton, InviteSignUpForm } from "./invite-forms";

export const metadata: Metadata = {
  title: "Convite para a equipe",
  robots: { index: false },
};

export default function InvitePage({ params }: PageProps<"/convite/[token]">) {
  return (
    <Suspense fallback={<FormSkeleton fields={3} />}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({
  params,
}: Pick<PageProps<"/convite/[token]">, "params">) {
  await connection();
  const { token } = await params;
  const invite = await findInvite(token);

  if (invite.status !== "open") {
    return (
      <Problem
        title={
          invite.status === "accepted"
            ? "Este convite já foi usado"
            : invite.status === "expired"
              ? "Este convite venceu"
              : "Convite não encontrado"
        }
      >
        {invite.status === "accepted" ? (
          <>
            Se foi você quem aceitou,{" "}
            <Link href="/entrar" className="font-medium text-primary underline">
              entre na sua conta
            </Link>
            .
          </>
        ) : (
          "Peça à responsável pela clínica um link novo."
        )}
      </Problem>
    );
  }

  const areas = invite.permissions
    .filter(isArea)
    .map((a) => AREAS[a].label)
    .join(", ");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const next = `/convite/${token}`;

  return (
    <>
      <AuthHeading
        title={`Equipe da ${invite.clinicName}`}
        description={
          <>
            Você foi convidada(o) para o painel da LumenzIA com acesso a:{" "}
            <strong className="text-foreground">{areas}</strong>.
          </>
        }
      />
      {user ? (
        user.email?.toLowerCase() === invite.email.toLowerCase() ? (
          <AcceptButton token={token} email={invite.email} />
        ) : (
          <Problem title="Você entrou com outro e-mail">
            Este convite é para <strong>{invite.email}</strong>, mas você está
            usando {user.email}. Saia e abra o link de novo.
            <form action={signOut} className="mt-4">
              <Button type="submit" variant="outline" size="sm">
                Sair desta conta
              </Button>
            </form>
          </Problem>
        )
      ) : (
        <>
          <InviteSignUpForm
            token={token}
            email={invite.email}
            fullName={invite.fullName}
          />
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Já tenho conta com este e-mail:{" "}
            <Link
              href={`/entrar?next=${encodeURIComponent(next)}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              entrar e aceitar
            </Link>
          </p>
        </>
      )}
    </>
  );
}

function Problem({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
      <div>
        <p className="font-medium">{title}</p>
        <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
