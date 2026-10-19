import { Suspense } from "react";
import type { Metadata } from "next";
import { Images } from "lucide-react";

import { PageHeader, PanelSkeleton } from "@/components/painel/page";
import { PhotoManager } from "@/components/painel/photo-manager";
import { getPanelContext } from "@/lib/painel/context";

export const metadata: Metadata = { title: "Fotos" };

export default function PhotosPage() {
  return (
    <>
      <PageHeader
        icon={Images}
        title="Fotos"
        description="Antes e depois, ambiente, tabela de valores… A assistente envia no WhatsApp quando fizer sentido na conversa."
      />
      <Suspense fallback={<PanelSkeleton />}>
        <Photos />
      </Suspense>
    </>
  );
}

async function Photos() {
  const { supabase, clinic } = await getPanelContext();
  const { data, error } = await supabase
    .from("images")
    .select("id, storage_path, description")
    .eq("clinic_id", clinic.id)
    .order("created_at");
  if (error) throw new Error(error.message);

  return <PhotoManager clinicId={clinic.id} initialPhotos={data ?? []} />;
}
