"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, LogOut, Search, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";

import { signOut } from "@/app/(auth)/actions";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { SEARCH_ITEMS } from "./nav";

type Command = {
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
  run: () => void;
};

/** Tira acentos e maiúsculas para "horarios" achar "Horários". */
function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Busca rápida (Ctrl+K): pula para qualquer tela do painel e faz ações comuns. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Buscar no painel</DialogTitle>
        {/* Remontar a cada abertura zera a busca e a seleção. */}
        {open && <Palette close={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Palette({ close }: { close: () => void }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const commands = useMemo<Command[]>(
    () => [
      ...SEARCH_ITEMS.map((item) => ({
        id: item.href,
        label: item.label,
        hint: "Ir para",
        icon: item.icon,
        keywords: `${item.label} ${item.keywords ?? ""}`,
        run: () => router.push(item.href),
      })),
      {
        id: "tema",
        label: "Alternar tema claro/escuro",
        hint: "Ação",
        icon: SunMoon,
        keywords: "tema escuro claro dark light",
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "sair",
        label: "Sair da conta",
        hint: "Ação",
        icon: LogOut,
        keywords: "sair logout desconectar",
        run: () => startTransition(() => signOut()),
      },
    ],
    [router, resolvedTheme, setTheme],
  );

  const results = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return commands.filter((c) =>
      terms.every((t) => normalize(c.keywords).includes(t)),
    );
  }, [commands, query]);

  const selected = Math.min(index, Math.max(results.length - 1, 0));

  const choose = (command: Command | undefined) => {
    if (!command) return;
    close();
    command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((selected + 1) % Math.max(results.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((selected - 1 + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[selected]);
    }
  };

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          placeholder="Para onde você quer ir?"
          aria-label="Buscar"
          role="combobox"
          aria-expanded
          aria-controls="painel-busca"
          aria-activedescendant={
            results[selected] ? `cmd-${results[selected].id}` : undefined
          }
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </div>
      <ul
        id="painel-busca"
        role="listbox"
        className="max-h-80 overflow-y-auto p-2"
      >
        {results.length === 0 && (
          <li className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nada encontrado para “{query}”.
          </li>
        )}
        {results.map((c, i) => {
          const Icon = c.icon;
          const isSelected = i === selected;
          return (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={isSelected}
              onMouseMove={() => setIndex(i)}
              onClick={() => choose(c)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                isSelected && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{c.label}</span>
              <span className="text-xs text-muted-foreground">{c.hint}</span>
              {isSelected && (
                <CornerDownLeft className="size-3.5 text-muted-foreground" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
