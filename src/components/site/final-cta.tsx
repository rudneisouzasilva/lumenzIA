import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/site/reveal";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/site";

export function FinalCta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-fuchsia-600 to-primary px-6 py-16 text-center text-white shadow-2xl shadow-primary/30 sm:px-12">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 size-72 rounded-full bg-glow/40 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-24 size-72 rounded-full bg-white/20 blur-3xl"
        />
        <h2 className="relative font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Comece a atender seus pacientes a qualquer hora.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-white/85">
          Configure em minutos, teste no painel e ligue quando estiver pronta.
        </p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="group h-12 px-7 text-base"
          >
            <Link href="/planos">
              Ver planos
              <ArrowRight className="transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 border-white/40 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white dark:border-white/40 dark:bg-transparent"
          >
            <a href={whatsappLink()} target="_blank" rel="noopener">
              Tirar dúvidas no WhatsApp
            </a>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
