// Planilhas CSV no padrão do Excel em português: ponto e vírgula, BOM no começo e fim de linha
// \r\n. Sem "server-only": a leitura (parseCsv) roda no navegador, na importação do funil.

/**
 * Célula de CSV. Texto que começa com =, +, - ou @ ganha um apóstrofo na frente, para o Excel não
 * rodar como fórmula algo que veio de uma conversa ("@fulana", usuário do Instagram, passa).
 */
export function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const formula = /^(?:[=+\-\t\r]|@(?![\w.]+$))/.test(raw);
  const text = typeof value === "string" && formula ? `'${raw}` : raw;
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Arquivo CSV inteiro, com BOM para o Excel abrir os acentos certos. */
export function toCsv(header: string[], rows: unknown[][]) {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n");
}

/**
 * Lê um CSV salvo pelo Excel, Google Planilhas ou Numbers: separador ";", "," ou tab (o que
 * aparecer mais na primeira linha), aspas, quebras de linha dentro de aspas e BOM. Linhas vazias
 * somem.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map(
    (d) => [d, firstLine.split(d).length - 1] as const,
  );
  const delimiter =
    counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ";";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}
