"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Dentro do painel: o menu continua na tela e só o conteúdo mostra o erro. */
export default function PanelError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <ErrorScreen
      error={error}
      retry={retry}
      homeHref="/painel"
      homeLabel="Ir para o início do painel"
    />
  );
}
