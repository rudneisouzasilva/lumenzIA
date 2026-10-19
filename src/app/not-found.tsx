import Link from "next/link";

import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[30rem] -translate-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <Logo className="mb-10" />
      <p className="bg-gradient-to-r from-primary to-glow bg-clip-text font-display text-8xl font-semibold text-transparent">
        404
      </p>
      <h1 className="mt-4 font-display text-2xl font-semibold">
        Página não encontrada
      </h1>
      <p className="mt-2 text-muted-foreground">
        O endereço pode ter mudado ou estar digitado errado.
      </p>
      <Button asChild className="mt-8">
        <Link href="/">Voltar ao início</Link>
      </Button>
    </main>
  );
}
