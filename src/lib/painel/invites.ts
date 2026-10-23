import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Convites da equipe. O link leva um código aleatório; o banco guarda só o hash, então nem quem
 * lê a tabela consegue montar o link de novo.
 */

export const hashInviteToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export type InviteState =
  | { status: "invalid" }
  | { status: "expired" | "accepted"; clinicName: string }
  | {
      status: "open";
      id: string;
      clinicId: string;
      clinicName: string;
      fullName: string;
      email: string;
      permissions: string[];
    };

/** Lê o convite pelo código do link (com a chave secreta: quem abre ainda não tem conta). */
export async function findInvite(token: string): Promise<InviteState> {
  if (!/^[\w-]{20,100}$/.test(token)) return { status: "invalid" };
  const { data } = await createAdminClient()
    .from("clinic_invites")
    .select(
      "id, clinic_id, full_name, email, permissions, expires_at, accepted_at, clinics(name)",
    )
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (!data) return { status: "invalid" };
  const clinicName = data.clinics?.name ?? "a clínica";
  if (data.accepted_at) return { status: "accepted", clinicName };
  if (Date.parse(data.expires_at) < Date.now()) {
    return { status: "expired", clinicName };
  }
  return {
    status: "open",
    id: data.id,
    clinicId: data.clinic_id,
    clinicName,
    fullName: data.full_name,
    email: data.email,
    permissions: data.permissions,
  };
}
