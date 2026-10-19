import { ComingSoon } from "@/components/site/coming-soon";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight">
          Lumenz<span className="text-primary">IA</span>
        </span>
        <ThemeToggle />
      </header>
      <ComingSoon />
    </main>
  );
}
