"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  areaForPath,
  canAccess,
  type Access,
  type Area,
} from "@/lib/painel/areas";

/**
 * Áreas liberadas para quem está logado, para o menu e a busca esconderem o resto. Chega do
 * servidor pelo <AccessSync> do layout; até lá (null) mostra tudo. Quem decide de verdade é o
 * proxy, as ações e o banco: isto é só para não mostrar o que vai ser recusado.
 */
let current: Access | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function AccessSync({ access }: { access: Access }) {
  useEffect(() => {
    current = access;
    listeners.forEach((l) => l());
  }, [access]);
  return null;
}

export function usePanelAccess() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}

/** A tela pode aparecer no menu? Telas sem área (Início, Minha conta) aparecem para todos. */
export function visibleFor(access: Access | null, href: string) {
  if (!access) return !href.startsWith("/painel/equipe");
  if (href.startsWith("/painel/equipe") || href === "/assinatura") {
    return access.owner;
  }
  const area: Area | null = areaForPath(href);
  return area === null || canAccess(access, area);
}
