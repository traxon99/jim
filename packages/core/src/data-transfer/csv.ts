/**
 * RFC 4180 CSV parsing and writing for workout import/export (issues #241,
 * #242). Strong writes comma- or (older, some locales) semicolon-separated
 * files, so the delimiter is sniffed from the header line.
 */

function sniffDelimiter(text: string): "," | ";" {
  const headerEnd = text.search(/\r?\n/);
  const header = headerEnd === -1 ? text : text.slice(0, headerEnd);
  const commas = header.split(",").length;
  const semicolons = header.split(";").length;
  return semicolons > commas ? ";" : ",";
}

/** Every row of `text` as string cells. Quoted fields may contain delimiters, quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = sniffDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // A blank line is one empty cell, not a row of data.
  return rows.filter((cells) => cells.length > 1 || cells[0] !== "");
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Comma-separated, CRLF line endings, fields quoted only when they need it. */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  return rows
    .map((row) => row.map((cell) => escapeCell(cell == null ? "" : String(cell))).join(","))
    .join("\r\n");
}
