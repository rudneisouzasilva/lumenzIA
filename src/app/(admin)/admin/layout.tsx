import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/shell";

export const metadata: Metadata = {
  title: { default: "Equipe", template: "%s · Equipe LumenzIA" },
  robots: { index: false },
};

// Quem não é da equipe recebe 404 em cada página (getAdminContext), dentro do <Suspense> dela.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
