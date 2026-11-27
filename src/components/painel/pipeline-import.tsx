"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { importContacts } from "@/app/(painel)/painel/funil/actions";
import { selectClassName } from "@/components/painel/template-send-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { parseCsv, toCsv } from "@/lib/csv";
import { parseReais } from "@/lib/money";
import { IMPORT_MAX_ROWS } from "@/lib/painel/pipeline";

type Field = "phone" | "name" | "notes" | "value";

const FIELDS: {
  key: Field;
  label: string;
  guess: RegExp;
  required?: boolean;
}[] = [
  {
    key: "phone",
    label: "Telefone (com DDD)",
    guess: /telefone|celular|whats|fone|phone|n[uú]mero/i,
    required: true,
  },
  { key: "name", label: "Nome", guess: /^nome$|nome|paciente|cliente|name/i },
  {
    key: "notes",
    label: "Anotações",
    guess: /anota|observa|obs|nota|coment/i,
  },
  { key: "value", label: "Valor estimado (R$)", guess: /valor|pre[cç]o|r\$/i },
];

const TEMPLATE = toCsv(
  ["Nome", "Telefone", "Anotações", "Valor estimado (R$)"],
  [
    [
      "Maria Silva",
      "(13) 99999-0000",
      "Interesse em limpeza de pele",
      "250,00",
    ],
  ],
);

/** Escolhe a coluna de cada campo pelo nome do cabeçalho (cada coluna serve a um campo só). */
function guessColumns(header: string[]) {
  const used = new Set<number>();
  const out = {} as Record<Field, number>;
  for (const f of FIELDS) {
    const i = header.findIndex((h, idx) => !used.has(idx) && f.guess.test(h));
    out[f.key] = i;
    if (i >= 0) used.add(i);
  }
  return out;
}

/** Importar pacientes de uma planilha CSV para o funil (só a dona da conta). */
export function PipelineImport({
  open,
  onOpenChange,
  stages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: { id: string; name: string }[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [columns, setColumns] = useState<Record<Field, number> | null>(null);
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const header = table?.[0] ?? [];
  const body = useMemo(() => table?.slice(1) ?? [], [table]);

  const reset = () => {
    setFileName("");
    setTable(null);
    setColumns(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  const readFile = async (file: File) => {
    setError(null);
    if (/\.(xlsx?|numbers|ods)$/i.test(file.name)) {
      setError(
        "Salve a planilha como CSV antes de importar: no Excel, Arquivo → Salvar como → CSV; no Google Planilhas, Arquivo → Fazer download → CSV.",
      );
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Arquivo grande demais (máximo de 5 MB).");
      return;
    }
    // O Excel em português costuma salvar CSV em Windows-1252: se o UTF-8 der caracteres
    // estranhos, lê de novo nessa codificação.
    const bytes = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(bytes);
    if (text.includes("�"))
      text = new TextDecoder("windows-1252").decode(bytes);
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setError(
        "A planilha precisa de uma linha de títulos e pelo menos um paciente.",
      );
      return;
    }
    setFileName(file.name);
    setTable(rows);
    setColumns(guessColumns(rows[0]));
  };

  const cell = (row: string[], field: Field) =>
    columns && columns[field] >= 0 ? (row[columns[field]] ?? "") : "";

  const submit = () => {
    if (!columns || columns.phone < 0) {
      setError("Escolha a coluna do telefone.");
      return;
    }
    if (body.length > IMPORT_MAX_ROWS) {
      setError(
        `A planilha tem ${body.length.toLocaleString("pt-BR")} linhas. Importe no máximo ${IMPORT_MAX_ROWS.toLocaleString("pt-BR")} de uma vez.`,
      );
      return;
    }
    const rows = body.map((r) => ({
      name: cell(r, "name").slice(0, 120),
      phone: cell(r, "phone").slice(0, 40),
      notes: cell(r, "notes").slice(0, 2000),
      valueCents: parseReais(cell(r, "value")),
    }));
    setError(null);
    startTransition(async () => {
      const result = await importContacts({ stageId: stageId || null, rows });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? "Importação concluída.");
      reset();
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl">
        <DialogTitle>Importar pacientes</DialogTitle>
        <DialogDescription>
          Use uma planilha em CSV com uma linha de títulos. O telefone com DDD é
          obrigatório. Quem já está no funil não muda de etapa: só ganha nome,
          anotações e valor que estavam vazios.
        </DialogDescription>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv,.txt,.xlsx,.xls"
              className="sr-only"
              id="import-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
            <Button asChild variant="outline">
              <label htmlFor="import-file" className="cursor-pointer">
                <Upload />
                {fileName ? "Trocar arquivo" : "Escolher arquivo CSV"}
              </label>
            </Button>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
              download="modelo-pacientes.csv"
              className="text-sm text-primary underline underline-offset-4"
            >
              Baixar modelo
            </a>
          </div>
          {fileName && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4" />
              {fileName}: {body.length.toLocaleString("pt-BR")}{" "}
              {body.length === 1 ? "linha" : "linhas"}
            </p>
          )}

          {columns && (
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1.5">
                  <Label htmlFor={`col-${f.key}`}>{f.label}</Label>
                  <select
                    id={`col-${f.key}`}
                    className={selectClassName}
                    value={columns[f.key]}
                    onChange={(e) =>
                      setColumns({
                        ...columns,
                        [f.key]: Number(e.target.value),
                      })
                    }
                  >
                    <option value={-1}>
                      {f.required ? "Escolha a coluna" : "Não importar"}
                    </option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Coluna ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="import-stage">
                  Etapa em que os novos pacientes entram
                </Label>
                <select
                  id="import-stage"
                  className={selectClassName}
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="">Sem etapa</option>
                </select>
              </div>
            </div>
          )}

          {columns && columns.phone >= 0 && body.length > 0 && (
            <div className="overflow-x-auto rounded-lg border text-sm">
              <table className="w-full">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Telefone</th>
                    <th className="px-3 py-2 font-medium">Anotações</th>
                  </tr>
                </thead>
                <tbody>
                  {body.slice(0, 3).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{cell(r, "name") || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {cell(r, "phone") || "—"}
                      </td>
                      <td className="max-w-48 truncate px-3 py-2">
                        {cell(r, "notes") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !columns}>
              {pending && <Loader2 className="animate-spin" />}
              Importar{" "}
              {body.length
                ? `${body.length.toLocaleString("pt-BR")} ${body.length === 1 ? "linha" : "linhas"}`
                : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
