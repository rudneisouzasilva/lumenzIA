"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function Error({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col">
      <ErrorScreen
        error={error}
        retry={retry}
        homeHref="/"
        homeLabel="Voltar ao início"
      />
    </main>
  );
}
