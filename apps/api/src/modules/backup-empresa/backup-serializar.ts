import { Prisma } from '@prisma/client';

/**
 * Valor de uma coluna como vai no JSONL do pacote. O tipo de cada coluna está
 * no schema (o `manifesto.json` leva a versão), então a restauração sabe
 * converter de volta: data em ISO, decimal e bigint como texto (sem perder
 * precisão), bytes em base64.
 */
export function valorParaJson(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'bigint') return valor.toString();
  if (Prisma.Decimal.isDecimal(valor)) return valor.toString();
  if (Buffer.isBuffer(valor) || valor instanceof Uint8Array) {
    return Buffer.from(valor).toString('base64');
  }
  return valor;
}

export function linhaJson(registro: Record<string, unknown>, campos: string[]) {
  const saida: Record<string, unknown> = {};
  for (const c of campos) saida[c] = valorParaJson(registro[c]);
  return JSON.stringify(saida);
}

/**
 * CSV para abrir no Excel em português: separador `;` (o padrão do Excel
 * pt-BR), texto entre aspas quando precisa, JSON para campos estruturados.
 * O arquivo começa com BOM (ver `CSV_BOM`) para o Excel ler os acentos.
 */
export const CSV_BOM = String.fromCharCode(0xfeff);

function celula(valor: unknown): string {
  const v = valorParaJson(valor);
  if (v === null) return '';
  // Número e booleano saem iguais em JSON; objeto (campo Json) vira JSON.
  const texto = typeof v === 'string' ? v : JSON.stringify(v);
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function linhaCsv(registro: Record<string, unknown>, campos: string[]) {
  return campos.map((c) => celula(registro[c])).join(';');
}

export const cabecalhoCsv = (campos: string[]) =>
  campos.map((c) => celula(c)).join(';');
