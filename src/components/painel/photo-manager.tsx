"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Pencil, Trash2, UploadCloud } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import {
  createImage,
  deleteImage,
  updateImageDescription,
} from "@/app/(painel)/painel/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_IMAGES } from "@/lib/painel/validation";
import { createClient } from "@/lib/supabase/client";
import { IMAGES_BUCKET as BUCKET, publicImageUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 1600;

export type Photo = { id: string; storage_path: string; description: string };

/**
 * Reduz a foto para no máximo 1600 px e converte para JPEG (o formato que o WhatsApp aceita em
 * qualquer aparelho). Fundo branco para PNGs transparentes.
 */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))),
      "image/jpeg",
      0.85,
    ),
  );
}

export function PhotoManager({
  clinicId,
  initialPhotos,
}: {
  clinicId: string;
  initialPhotos: Photo[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    preview: string;
  } | null>(null);
  const full = photos.length >= MAX_IMAGES;

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use uma foto em JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error("Foto muito grande. Use uma de até 20 MB.");
      return;
    }
    if (pendingFile) URL.revokeObjectURL(pendingFile.preview);
    setPendingFile({ file, preview: URL.createObjectURL(file) });
  };

  const clearPending = () => {
    if (pendingFile) URL.revokeObjectURL(pendingFile.preview);
    setPendingFile(null);
  };

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait" initial={false}>
        {pendingFile ? (
          <UploadForm
            key="form"
            clinicId={clinicId}
            file={pendingFile.file}
            preview={pendingFile.preview}
            onCancel={clearPending}
            onUploaded={(photo) => {
              setPhotos((p) => [...p, photo]);
              clearPending();
            }}
          />
        ) : (
          <Dropzone key="drop" disabled={full} onFile={pick} />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {photos.length} de {MAX_IMAGES} fotos
        </span>
      </div>

      <motion.ul layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence initial={false}>
          {photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              onDeleted={() =>
                setPhotos((p) => p.filter((x) => x.id !== photo.id))
              }
              onChanged={(description) =>
                setPhotos((p) =>
                  p.map((x) => (x.id === photo.id ? { ...x, description } : x)),
                )
              }
            />
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}

function Dropzone({
  disabled,
  onFile,
}: {
  disabled: boolean;
  onFile: (file: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFile(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center rounded-2xl border-2 border-dashed bg-card/50 px-6 py-10 text-center transition-colors outline-none hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
          over && "border-primary bg-primary/5",
        )}
      >
        <motion.span
          animate={over ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }}
          className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <UploadCloud className="size-6" />
        </motion.span>
        <span className="mt-4 font-medium">
          {disabled
            ? `Você chegou ao limite de ${MAX_IMAGES} fotos`
            : "Arraste uma foto aqui ou clique para escolher"}
        </span>
        <span className="mt-1 text-sm text-muted-foreground">
          JPG, PNG ou WebP. Reduzimos o tamanho sozinhos.
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}

function UploadForm({
  clinicId,
  file,
  preview,
  onCancel,
  onUploaded,
}: {
  clinicId: string;
  file: File;
  preview: string;
  onCancel: () => void;
  onUploaded: (photo: Photo) => void;
}) {
  const [description, setDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const tooShort = description.trim().length < 3;

  const upload = () =>
    startTransition(async () => {
      try {
        const blob = await toJpeg(file);
        const path = `${clinicId}/${crypto.randomUUID()}.jpg`;
        const { error } = await createClient()
          .storage.from(BUCKET)
          .upload(path, blob, {
            contentType: "image/jpeg",
            cacheControl: "31536000",
          });
        if (error) throw error;

        const result = await createImage({
          storagePath: path,
          originalName: file.name,
          description,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Foto adicionada.");
        onUploaded(result.image);
      } catch (e) {
        console.error("[fotos]", e);
        toast.error("Não foi possível enviar a foto. Tente de novo.");
      }
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="grid gap-5 rounded-2xl border border-primary/40 bg-card p-5 shadow-sm sm:grid-cols-[12rem_1fr]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
      <img
        src={preview}
        alt="Prévia da foto escolhida"
        className="aspect-square w-full rounded-xl object-cover"
      />
      <div className="flex flex-col gap-3">
        <label htmlFor="photo-description" className="text-sm font-medium">
          Quando a assistente deve enviar esta foto?
        </label>
        <Textarea
          id="photo-description"
          autoFocus
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex.: Antes e depois de preenchimento labial. Enviar quando perguntarem como fica o resultado."
        />
        <p className="text-xs text-muted-foreground">
          A assistente decide sozinha a hora de enviar, com base nesta
          descrição.
        </p>
        <div className="mt-auto flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={upload} disabled={pending || tooShort}>
            {pending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {pending ? "Enviando…" : "Adicionar foto"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function PhotoCard({
  photo,
  onDeleted,
  onChanged,
}: {
  photo: Photo;
  onDeleted: () => void;
  onChanged: (description: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState(photo.description);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updateImageDescription(photo.id, {
        description: text,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onChanged(text.trim());
      setEditing(false);
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteImage(photo.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDeleted();
    });

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="group overflow-hidden rounded-2xl border bg-card shadow-xs"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- já reduzida no envio, servida pelo Storage */}
        <img
          src={publicImageUrl(photo.storage_path)}
          alt={photo.description}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {!editing && (
          <div className="absolute top-2 right-2 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <Button
              size="icon"
              variant="secondary"
              className="size-8 shadow"
              aria-label="Editar descrição"
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-8 shadow hover:text-destructive"
              aria-label="Excluir foto"
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <div className="p-4">
        {editing ? (
          <div className="grid gap-2">
            <Textarea
              value={text}
              maxLength={500}
              autoFocus
              onChange={(e) => setText(e.target.value)}
              aria-label="Quando enviar esta foto"
              className="min-h-20 text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setText(photo.description);
                  setEditing(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={pending || text.trim().length < 3}
              >
                {pending && <Loader2 className="animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        ) : confirming ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">Excluir esta foto?</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(false)}
              >
                Manter
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={remove}
                disabled={pending}
              >
                {pending && <Loader2 className="animate-spin" />}
                Excluir
              </Button>
            </div>
          </div>
        ) : (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {photo.description}
          </p>
        )}
      </div>
    </motion.li>
  );
}
