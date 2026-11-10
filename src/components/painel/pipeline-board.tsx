"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteLostReason,
  deleteStage,
  moveContact,
  reorderStages,
  saveContactDetails,
  saveLostReason,
  saveStage,
} from "@/app/(painel)/painel/funil/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, formatRelative } from "@/lib/format";
import {
  AUTO_RULE_LABEL,
  STAGE_COLOR_CLASS,
  STAGE_COLOR_LABEL,
  STAGE_COLORS,
  STAGE_KIND_LABEL,
  type StageColor,
  type StageKind,
} from "@/lib/painel/pipeline";
import { cn } from "@/lib/utils";

import { selectClassName } from "./template-send-dialog";

export type BoardStage = {
  id: string;
  name: string;
  color: StageColor;
  kind: StageKind;
  autoRule: string | null;
  total: number;
};

export type BoardContact = {
  id: string;
  /** Telefone formatado, ou o @ do Instagram. */
  handle: string;
  name: string | null;
  savedName: string;
  stageId: string | null;
  stageChangedAt: string | null;
  ownerId: string | null;
  estimatedValueCents: number | null;
  notes: string;
  lostReasonId: string | null;
  lastContactAt: string;
  optedOut: boolean;
  /** O que a pessoa informou ao agendar ("E-mail", "CPF"...), como [rótulo, valor]. */
  patientData: [string, string][];
  lastConversationId: number | null;
  lastSummary: string | null;
};

type Option = { id: string; name: string };

type Move = { contact: BoardContact; stage: BoardStage };

/** Cartão sendo arrastado: tamanho e onde o dedo/cursor pegou nele. */
type Drag = {
  contact: BoardContact;
  width: number;
  dx: number;
  dy: number;
};

/** Clique/toque que ainda pode virar arraste. */
type Press = {
  contact: BoardContact;
  el: HTMLElement;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  timer: number | null;
};

/** Quanto o cursor anda antes de virar arraste (abaixo disso é clique). */
const DRAG_THRESHOLD = 5;
/** No celular, segurar o dedo este tempo começa o arraste. */
const LONG_PRESS_MS = 250;
/** Faixa perto da borda que faz o quadro rolar sozinho. */
const EDGE = 72;

const byRecent = (a: BoardContact, b: BoardContact) =>
  b.lastContactAt.localeCompare(a.lastContactAt);

export function PipelineBoard({
  query,
  stages,
  unstagedTotal,
  contacts: initial,
  lostReasons,
  members,
}: {
  query: string;
  stages: BoardStage[];
  unstagedTotal: number;
  contacts: BoardContact[];
  lostReasons: Option[];
  members: Option[];
}) {
  const [contacts, setContacts] = useState(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const press = useRef<Press | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const ghost = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const justDropped = useRef(false);
  const [open, setOpen] = useState<BoardContact | null>(null);
  const [askLost, setAskLost] = useState<Move | null>(null);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const [seenInitial, setSeenInitial] = useState(initial);
  // Dados novos do servidor (depois de salvar) substituem o estado local.
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    setContacts(initial);
  }

  const columns: (BoardStage | null)[] = [
    ...stages,
    ...(unstagedTotal ? [null] : []),
  ];

  const move = (
    contact: BoardContact,
    stage: BoardStage,
    lostReasonId: string | null = null,
  ) => {
    if (contact.stageId === stage.id) return;
    if (
      stage.kind === "perdido" &&
      lostReasonId === null &&
      lostReasons.length
    ) {
      setAskLost({ contact, stage });
      return;
    }
    const before = contacts;
    setContacts((list) =>
      list.map((c) =>
        c.id === contact.id
          ? {
              ...c,
              stageId: stage.id,
              lostReasonId,
              stageChangedAt: new Date().toISOString(),
            }
          : c,
      ),
    );
    startTransition(async () => {
      const result = await moveContact({
        contactId: contact.id,
        stageId: stage.id,
        lostReasonId,
      });
      if (!result.ok) {
        toast.error(result.error);
        setContacts(before);
      }
    });
  };

  // Coluna (etapa) embaixo do cursor. O fantasma não recebe eventos, então
  // não atrapalha a busca.
  const stageAt = (x: number, y: number) =>
    (
      document
        .elementFromPoint(x, y)
        ?.closest("[data-stage-id]") as HTMLElement | null
    )?.dataset.stageId ?? null;

  const placeGhost = () => {
    if (!ghost.current || !drag) return;
    const { x, y } = pointer.current;
    ghost.current.style.transform = `translate3d(${x - drag.dx}px, ${y - drag.dy}px, 0) rotate(2deg)`;
  };
  // A cada render o React não mexe no transform; aplicamos a posição atual.
  useLayoutEffect(placeGhost);

  const startDrag = (p: Press) => {
    const rect = p.el.getBoundingClientRect();
    setDrag({
      contact: p.contact,
      width: rect.width,
      dx: p.startX - rect.left,
      dy: p.startY - rect.top,
    });
    setOver(p.contact.stageId);
    if (p.touch) navigator.vibrate?.(10);
  };

  const clearPress = () => {
    if (press.current?.timer) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const endDrag = (drop: boolean) => {
    const p = press.current;
    clearPress();
    if (!drag) return;
    const target = drop ? stages.find((s) => s.id === over) : undefined;
    setDrag(null);
    setOver(null);
    // O clique que vem logo depois de soltar não deve abrir o contato.
    justDropped.current = true;
    window.setTimeout(() => (justDropped.current = false), 0);
    if (target && p) move(p.contact, target);
  };

  const onPointerDown = (e: React.PointerEvent, contact: BoardContact) => {
    if (e.button !== 0 || drag) return;
    const touch = e.pointerType === "touch";
    const p: Press = {
      contact,
      el: e.currentTarget as HTMLElement,
      pointerId: e.pointerId,
      touch,
      startX: e.clientX,
      startY: e.clientY,
      timer: null,
    };
    pointer.current = { x: e.clientX, y: e.clientY };
    // No toque, arrastar o dedo direto rola a tela; segurar um instante pega
    // o cartão.
    if (touch)
      p.timer = window.setTimeout(() => {
        p.timer = null;
        if (press.current === p) startDrag(p);
      }, LONG_PRESS_MS);
    press.current = p;
  };

  const onPointerMove = useEffectEvent((e: PointerEvent) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    if (!drag) {
      const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (moved < DRAG_THRESHOLD) return;
      if (p.touch)
        clearPress(); // mexeu antes do tempo: é rolagem
      else startDrag(p);
      return;
    }
    placeGhost();
    const id = stageAt(e.clientX, e.clientY);
    if (id !== over) setOver(id);
  });

  const onPointerUp = useEffectEvent((e: PointerEvent) => {
    if (press.current && e.pointerId === press.current.pointerId)
      endDrag(e.type === "pointerup");
  });

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape" && drag) endDrag(false);
  });

  // Rola o quadro sozinho quando o cartão chega perto da borda.
  const autoScroll = useEffectEvent(() => {
    const el = scroller.current;
    if (!el) return;
    const { x, y } = pointer.current;
    const rect = el.getBoundingClientRect();
    const left = Math.max(rect.left, 0) + EDGE;
    const right = Math.min(rect.right, window.innerWidth) - EDGE;
    const step =
      x < left
        ? -Math.ceil(((left - x) / EDGE) * 16)
        : x > right
          ? Math.ceil(((x - right) / EDGE) * 16)
          : 0;
    if (!step) return;
    const before = el.scrollLeft;
    el.scrollLeft += step;
    if (el.scrollLeft !== before) {
      const id = stageAt(x, y);
      if (id !== over) setOver(id);
    }
  });

  useEffect(() => {
    const blockTouchScroll = (e: TouchEvent) => {
      if (drag) e.preventDefault();
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchmove", blockTouchScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchmove", blockTouchScroll);
    };
  }, [drag]);

  useEffect(() => {
    if (!drag) return;
    let frame = 0;
    const tick = () => {
      autoScroll();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const { style } = document.body;
    style.cursor = "grabbing";
    style.userSelect = "none";
    return () => {
      cancelAnimationFrame(frame);
      style.cursor = "";
      style.userSelect = "";
    };
  }, [drag]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex w-full max-w-sm gap-2" action="/painel/funil">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              defaultValue={query}
              placeholder="Buscar por nome ou telefone"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Settings2 />
          Etapas e motivos de perda
        </Button>
      </div>

      <div
        ref={scroller}
        className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0"
      >
        <div className="flex gap-3">
          {columns.map((stage) => {
            const id = stage?.id ?? "none";
            const items = contacts.filter(
              (c) => c.stageId === (stage?.id ?? null),
            );
            const moved =
              items.length -
              initial.filter((c) => c.stageId === (stage?.id ?? null)).length;
            const total = (stage?.total ?? unstagedTotal) + moved;
            const target = drag !== null && stage !== null && over === id;
            // Enquanto arrasta, o cartão aparece como "vaga" na coluna de
            // destino, na posição em que vai ficar.
            const shown =
              target && drag.contact.stageId !== stage.id
                ? [...items, drag.contact].sort(byRecent)
                : items;
            return (
              <section
                key={id}
                aria-label={stage?.name ?? "Sem etapa"}
                data-stage-id={stage?.id}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/40 transition-colors",
                  target &&
                    "border-primary bg-primary/5 ring-2 ring-primary/20",
                  drag && !stage && "opacity-60",
                )}
              >
                <header
                  className="flex items-center gap-2 px-3 pt-3 pb-2"
                  title={
                    stage?.autoRule
                      ? AUTO_RULE_LABEL[stage.autoRule]
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      stage
                        ? STAGE_COLOR_CLASS[stage.color]
                        : "bg-muted-foreground",
                    )}
                  />
                  <h2 className="flex-1 truncate text-sm font-semibold">
                    {stage?.name ?? "Sem etapa"}
                  </h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {total.toLocaleString("pt-BR")}
                  </span>
                </header>
                <ul className="flex max-h-[65svh] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {shown.map((c) => {
                    const held = drag?.contact.id === c.id;
                    return (
                      <li
                        key={c.id}
                        onPointerDown={(e) => onPointerDown(e, c)}
                        onContextMenu={(e) => drag && e.preventDefault()}
                        className="[-webkit-touch-callout:none]"
                      >
                        <ContactCard
                          contact={c}
                          owner={members.find((m) => m.id === c.ownerId)?.name}
                          slot={held ? (target ? "target" : "source") : null}
                          onOpen={() => {
                            if (!justDropped.current) setOpen(c);
                          }}
                        />
                      </li>
                    );
                  })}
                  {total > items.length && (
                    <li className="px-2 py-1 text-center text-xs text-muted-foreground">
                      +{(total - items.length).toLocaleString("pt-BR")}{" "}
                      {query ? "na busca" : "mais antigos (use a busca)"}
                    </li>
                  )}
                  {!shown.length && (
                    <li className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhum contato
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {drag && (
        <div
          ref={ghost}
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 z-50 will-change-transform"
          style={{ width: drag.width }}
        >
          <ContactCard
            contact={drag.contact}
            owner={members.find((m) => m.id === drag.contact.ownerId)?.name}
            lifted
          />
        </div>
      )}

      {open && (
        <ContactDialog
          key={open.id}
          contact={contacts.find((c) => c.id === open.id) ?? open}
          stages={stages}
          lostReasons={lostReasons}
          members={members}
          onClose={() => setOpen(null)}
        />
      )}

      {askLost && (
        <LostReasonDialog
          move={askLost}
          lostReasons={lostReasons}
          onCancel={() => setAskLost(null)}
          onConfirm={(reasonId) => {
            const { contact, stage } = askLost;
            setAskLost(null);
            move(contact, stage, reasonId);
          }}
        />
      )}

      {editing && (
        <StagesEditor
          stages={stages}
          lostReasons={lostReasons}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function ContactCard({
  contact,
  owner,
  onOpen,
  lifted = false,
  slot = null,
}: {
  contact: BoardContact;
  owner?: string;
  onOpen?: () => void;
  /** Cópia que segue o cursor durante o arraste. */
  lifted?: boolean;
  /**
   * Enquanto arrasta, o cartão original vira a "vaga": tracejada, sem texto.
   * É o mesmo elemento (não troca), senão o toque no celular se perde.
   */
  slot?: "source" | "target" | null;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      tabIndex={lifted ? -1 : undefined}
      className={cn(
        "w-full cursor-grab touch-manipulation rounded-xl border bg-card p-3 text-left shadow-xs transition select-none hover:border-primary/40 active:cursor-grabbing",
        lifted &&
          "cursor-grabbing border-primary/50 shadow-xl ring-1 ring-primary/20",
        slot && "border-dashed shadow-none *:invisible",
        slot === "source" && "border-border bg-muted/40",
        slot === "target" && "border-primary/60 bg-primary/10",
      )}
    >
      <p className="truncate text-sm font-medium">
        {contact.name ?? contact.handle}
      </p>
      {contact.name && (
        <p className="truncate text-xs text-muted-foreground">
          {contact.handle}
        </p>
      )}
      {contact.lastSummary && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
          {contact.lastSummary}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{formatRelative(contact.lastContactAt)}</span>
        {contact.estimatedValueCents != null && (
          <span className="font-medium text-foreground">
            {formatPrice(contact.estimatedValueCents)}
          </span>
        )}
        {owner && <span className="truncate">· {owner}</span>}
        {contact.optedOut && (
          <span className="rounded-full bg-muted px-1.5">
            não recebe mensagens
          </span>
        )}
      </div>
    </button>
  );
}

function LostReasonDialog({
  move,
  lostReasons,
  onCancel,
  onConfirm,
}: {
  move: Move;
  lostReasons: Option[];
  onCancel: () => void;
  onConfirm: (reasonId: string) => void;
}) {
  const [reason, setReason] = useState(lostReasons[0]?.id ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Por que perdeu?</DialogTitle>
        <DialogDescription>
          {move.contact.name ?? move.contact.handle} vai para &quot;
          {move.stage.name}&quot;. O motivo entra nos indicadores.
        </DialogDescription>
        <select
          aria-label="Motivo da perda"
          className={selectClassName}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {lostReasons.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={!reason} onClick={() => onConfirm(reason)}>
            Mover
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "1.500,50" → 150050 centavos; vazio → null. */
function parseMoney(value: string) {
  const clean = value.replace(/[^\d,.]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const n = Math.round(Number(normalized) * 100);
  return Number.isFinite(n) ? n : null;
}

const moneyText = (cents: number | null) =>
  cents == null
    ? ""
    : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

function ContactDialog({
  contact,
  stages,
  lostReasons,
  members,
  onClose,
}: {
  contact: BoardContact;
  stages: BoardStage[];
  lostReasons: Option[];
  members: Option[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: contact.savedName,
    stageId: contact.stageId ?? "",
    lostReasonId: contact.lostReasonId ?? "",
    ownerId: contact.ownerId ?? "",
    value: moneyText(contact.estimatedValueCents),
    notes: contact.notes,
  });
  const [pending, startTransition] = useTransition();
  const stage = stages.find((s) => s.id === form.stageId);
  const lost = stage?.kind === "perdido";

  const save = () =>
    startTransition(async () => {
      const lostReasonId = lost ? form.lostReasonId || null : null;
      if (form.stageId && form.stageId !== contact.stageId) {
        const moved = await moveContact({
          contactId: contact.id,
          stageId: form.stageId,
          lostReasonId,
        });
        if (!moved.ok) {
          toast.error(moved.error);
          return;
        }
      }
      const result = await saveContactDetails({
        contactId: contact.id,
        name: form.name,
        ownerId: form.ownerId || null,
        estimatedValueCents: parseMoney(form.value),
        notes: form.notes,
        lostReasonId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Salvo.");
      onClose();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{contact.name ?? contact.handle}</DialogTitle>
        <DialogDescription>
          {contact.handle} · último contato{" "}
          {formatRelative(contact.lastContactAt)}
          {contact.optedOut &&
            " · pediu para não receber mensagens automáticas"}
        </DialogDescription>

        {contact.lastSummary && (
          <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm">
            {contact.lastSummary}
          </p>
        )}
        {contact.patientData.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-sm">
            {contact.patientData.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {contact.lastConversationId && (
          <Button asChild variant="outline" size="sm" className="w-fit">
            <Link href={`/painel/atendimento?c=${contact.lastConversationId}`}>
              <MessageSquare />
              Abrir a última conversa
            </Link>
          </Button>
        )}

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="ct-name">Nome</Label>
            <Input
              id="ct-name"
              maxLength={120}
              placeholder={contact.name ?? "Nome do paciente"}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ct-stage">Etapa</Label>
              <select
                id="ct-stage"
                className={selectClassName}
                value={form.stageId}
                onChange={(e) => setForm({ ...form, stageId: e.target.value })}
              >
                {!form.stageId && <option value="">Sem etapa</option>}
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {lost ? (
              <div className="grid gap-2">
                <Label htmlFor="ct-lost">Motivo da perda</Label>
                <select
                  id="ct-lost"
                  className={selectClassName}
                  value={form.lostReasonId}
                  onChange={(e) =>
                    setForm({ ...form, lostReasonId: e.target.value })
                  }
                >
                  <option value="">Sem motivo</option>
                  {lostReasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="ct-owner">Responsável</Label>
                <select
                  id="ct-owner"
                  className={selectClassName}
                  value={form.ownerId}
                  onChange={(e) =>
                    setForm({ ...form, ownerId: e.target.value })
                  }
                >
                  <option value="">Ninguém</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ct-value">Valor estimado (R$)</Label>
            <Input
              id="ct-value"
              inputMode="decimal"
              placeholder="0,00"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ct-notes">Anotações</Label>
            <Textarea
              id="ct-notes"
              rows={3}
              maxLength={2000}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StagesEditor({
  stages,
  lostReasons,
  onClose,
}: {
  stages: BoardStage[];
  lostReasons: Option[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [newStage, setNewStage] = useState("");
  const [newReason, setNewReason] = useState("");
  const [removing, setRemoving] = useState<BoardStage | null>(null);

  const run = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    after?: () => void,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error);
      else after?.();
    });

  const moveStage = (index: number, delta: number) => {
    const ids = stages.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderStages(ids));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Etapas do funil</DialogTitle>
        <DialogDescription>
          As etapas com regra automática recebem os contatos sozinhas. Etapas
          &quot;ganho&quot; contam como sucesso nos indicadores;
          &quot;perdido&quot;, como perda.
        </DialogDescription>

        <ul className="grid gap-2">
          {stages.map((s, i) => (
            <StageRow
              key={`${s.id}-${s.name}-${s.color}-${s.kind}`}
              stage={s}
              first={i === 0}
              last={i === stages.length - 1}
              disabled={pending}
              onMove={(d) => moveStage(i, d)}
              onSave={(values) => run(() => saveStage({ id: s.id, ...values }))}
              onRemove={() => setRemoving(s)}
            />
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newStage.trim()) return;
            run(
              () =>
                saveStage({
                  id: null,
                  name: newStage,
                  color: "slate",
                  kind: "aberto",
                }),
              () => setNewStage(""),
            );
          }}
        >
          <Input
            aria-label="Nome da nova etapa"
            placeholder="Nova etapa (ex.: Orçamento enviado)"
            maxLength={40}
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            <Plus />
            Adicionar
          </Button>
        </form>

        <div className="mt-4 border-t pt-4">
          <h3 className="font-display font-semibold">Motivos de perda</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Perguntados quando alguém vai para uma etapa &quot;perdido&quot;.
          </p>
          <ul className="mt-3 grid gap-2">
            {lostReasons.map((r) => (
              <LostReasonRow
                key={`${r.id}-${r.name}`}
                reason={r}
                disabled={pending}
                onSave={(name) => run(() => saveLostReason({ id: r.id, name }))}
                onRemove={() => run(() => deleteLostReason(r.id))}
              />
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newReason.trim()) return;
              run(
                () => saveLostReason({ id: null, name: newReason }),
                () => setNewReason(""),
              );
            }}
          >
            <Input
              aria-label="Novo motivo de perda"
              placeholder="Novo motivo"
              maxLength={60}
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={pending}>
              <Plus />
              Adicionar
            </Button>
          </form>
        </div>

        {removing && (
          <RemoveStageDialog
            stage={removing}
            others={stages.filter((s) => s.id !== removing.id)}
            pending={pending}
            onCancel={() => setRemoving(null)}
            onConfirm={(moveTo) =>
              run(
                () => deleteStage(removing.id, moveTo),
                () => setRemoving(null),
              )
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StageRow({
  stage,
  first,
  last,
  disabled,
  onMove,
  onSave,
  onRemove,
}: {
  stage: BoardStage;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (delta: number) => void;
  onSave: (values: {
    name: string;
    color: StageColor;
    kind: StageKind;
  }) => void;
  onRemove: () => void;
}) {
  const [values, setValues] = useState({
    name: stage.name,
    color: stage.color,
    kind: stage.kind,
  });
  const dirty =
    values.name !== stage.name ||
    values.color !== stage.color ||
    values.kind !== stage.kind;

  return (
    <li className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[auto_1fr_8rem_10rem_auto] sm:items-center">
      <div className="flex gap-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Subir"
          disabled={first || disabled}
          onClick={() => onMove(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Descer"
          disabled={last || disabled}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </Button>
      </div>
      <div className="min-w-0">
        <Input
          aria-label="Nome da etapa"
          maxLength={40}
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
        {stage.autoRule && (
          <p className="mt-1 text-xs text-muted-foreground">
            Automática: {AUTO_RULE_LABEL[stage.autoRule].toLowerCase()}
          </p>
        )}
      </div>
      <select
        aria-label="Cor"
        className={selectClassName}
        value={values.color}
        onChange={(e) =>
          setValues({ ...values, color: e.target.value as StageColor })
        }
      >
        {STAGE_COLORS.map((c) => (
          <option key={c} value={c}>
            {STAGE_COLOR_LABEL[c]}
          </option>
        ))}
      </select>
      <select
        aria-label="Tipo"
        className={selectClassName}
        value={values.kind}
        onChange={(e) =>
          setValues({ ...values, kind: e.target.value as StageKind })
        }
      >
        {(Object.keys(STAGE_KIND_LABEL) as StageKind[]).map((k) => (
          <option key={k} value={k}>
            {STAGE_KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <div className="flex justify-end gap-1">
        {dirty && (
          <Button
            size="sm"
            disabled={disabled || !values.name.trim()}
            onClick={() => onSave(values)}
          >
            Salvar
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          aria-label="Apagar etapa"
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function LostReasonRow({
  reason,
  disabled,
  onSave,
  onRemove,
}: {
  reason: Option;
  disabled: boolean;
  onSave: (name: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(reason.name);
  return (
    <li className="flex gap-2">
      <Input
        aria-label="Motivo de perda"
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {name !== reason.name && (
        <Button
          disabled={disabled || !name.trim()}
          onClick={() => onSave(name)}
        >
          Salvar
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        aria-label="Apagar motivo"
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function RemoveStageDialog({
  stage,
  others,
  pending,
  onCancel,
  onConfirm,
}: {
  stage: BoardStage;
  others: BoardStage[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (moveTo: string) => void;
}) {
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Apagar &quot;{stage.name}&quot;?</DialogTitle>
        <DialogDescription>
          {stage.total
            ? `Os ${stage.total.toLocaleString("pt-BR")} contatos desta etapa vão para:`
            : "Escolha para onde iriam os contatos desta etapa:"}
          {stage.autoRule && " A regra automática desta etapa deixa de valer."}
        </DialogDescription>
        {others.length ? (
          <select
            aria-label="Mover os contatos para"
            className={selectClassName}
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
          >
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted-foreground">
            O funil precisa de pelo menos uma etapa.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!moveTo || pending}
            onClick={() => onConfirm(moveTo)}
          >
            {pending && <Loader2 className="animate-spin" />}
            Apagar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
