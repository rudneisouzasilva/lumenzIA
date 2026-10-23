import Link from "next/link";

import { LogoMark } from "@/components/site/logo";
import { site, whatsappLink } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <LogoMark className="size-5" />
          <span>© 2026 {site.name}. Todos os direitos reservados.</span>
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/privacidade" className="hover:text-foreground">
            Política de Privacidade
          </Link>
          <Link href="/exclusao-de-dados" className="hover:text-foreground">
            Exclusão de dados
          </Link>
          <Link href="/planos" className="hover:text-foreground">
            Planos
          </Link>
          <a
            href={whatsappLink()}
            target="_blank"
            rel="noopener"
            className="hover:text-foreground"
          >
            WhatsApp {site.whatsappLabel}
          </a>
        </nav>
      </div>
    </footer>
  );
}
