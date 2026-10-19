import { AuthShowcase } from "@/components/auth/auth-showcase";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh flex-1 lg:grid-cols-[1fr_1.05fr]">
      <AuthShowcase />
      <div className="relative flex flex-col overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 -z-10 size-[30rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl lg:hidden"
        />
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pt-4 pb-16 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
