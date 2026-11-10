"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * O que a pessoa vê quando uma tela falha ao carregar (banco fora do ar, internet caiu): uma
 * mensagem em português e um botão para tentar de novo, em vez da tela em branco do Next.
 * O código do erro ajuda a achar o registro nos logs da Vercel.
 */
export function ErrorScreen({
  error,
  retry,
  homeHref,
  homeLabel,
}: {
  error: unknown;
  retry: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  const digest =
    error instanceof Error && "digest" in error
      ? String((error as Error & { digest?: string }).digest ?? "")
      : "";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <TriangleAlert className="size-6" />
      </span>
      <h1 className="mt-4 font-display text-xl font-semibold">
        Não foi possível carregar esta tela
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pode ser uma instabilidade momentânea. Tente de novo em alguns segundos.
        Se continuar, fale com o suporte
        {digest ? " e informe o código abaixo" : ""}.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCw />
          Tentar de novo
        </Button>
        <Button variant="outline" asChild>
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </div>
      {digest && (
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          Código: {digest}
        </p>
      )}
    </div>
  );
}
