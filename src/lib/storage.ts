import { supabaseUrl } from "@/lib/supabase/env";

/** Bucket público das fotos que a assistente envia, em {clinic_id}/{arquivo}. */
export const IMAGES_BUCKET = "clinic-images";

/** Endereço público de uma foto (o WhatsApp baixa a foto por ele). */
export function publicImageUrl(path: string) {
  return `${supabaseUrl}/storage/v1/object/public/${IMAGES_BUCKET}/${path}`;
}
