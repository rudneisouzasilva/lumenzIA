/** O que guardar de cada tipo de mensagem do WhatsApp (o painel mostra só texto). */

const LABELS: Record<string, string> = {
  image: "📷 Foto",
  video: "🎬 Vídeo",
  audio: "🎤 Áudio",
  voice: "🎤 Áudio",
  document: "📄 Documento",
  sticker: "Figurinha",
  location: "📍 Localização",
  contacts: "👤 Contato",
  reaction: "Reação",
};

type AnyMessage = {
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

/** Texto da mensagem; para fotos, áudios etc., um rótulo com a legenda quando houver. */
export function messageText(msg: AnyMessage) {
  const type = msg.type ?? "";
  if (type === "text") return msg.text?.body?.trim() || "";
  if (type === "button") return msg.button?.text?.trim() || "Botão";
  if (type === "interactive") {
    return (
      msg.interactive?.button_reply?.title?.trim() ||
      msg.interactive?.list_reply?.title?.trim() ||
      "Resposta"
    );
  }
  const label = LABELS[type] ?? "Mensagem não suportada";
  const caption =
    (type === "image" && msg.image?.caption) ||
    (type === "video" && msg.video?.caption) ||
    (type === "document" &&
      (msg.document?.caption || msg.document?.filename)) ||
    "";
  return caption.trim() ? `${label}: ${caption.trim()}` : label;
}
