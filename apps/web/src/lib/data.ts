const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/;
const FORMATADOR_DATA_BR = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function partesDataCivil(valor: string | Date): [number, number, number] | null {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return [valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate()];
  }

  const partes = DATA_ISO.exec(valor);
  if (!partes) return null;
  return [Number(partes[1]), Number(partes[2]), Number(partes[3])];
}

function criarDataCivil(partes: [number, number, number]) {
  const [ano, mes, dia] = partes;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
    ? data
    : null;
}

/**
 * Formata uma data civil sem aplicar o fuso horário do navegador.
 *
 * Datas fiscais chegam da API como meia-noite UTC. Convertê-las para o fuso
 * local faria, por exemplo, 2026-09-28T00:00:00.000Z aparecer como 27/09/2026
 * em Mato Grosso.
 */
export function dataCivilBr(valor: string | null | undefined, vazio = "—") {
  if (!valor) return vazio;

  const partes = partesDataCivil(valor);
  if (!partes) return vazio;
  const data = criarDataCivil(partes);
  if (!data) return vazio;

  return FORMATADOR_DATA_BR.format(data);
}

/** Valor estável para um input HTML `date`. */
export function dataCivilParaInput(valor: unknown) {
  if (!(typeof valor === "string" || valor instanceof Date)) return "";
  const partes = partesDataCivil(valor);
  if (!partes) return "";
  if (!criarDataCivil(partes)) return "";
  const [ano, mes, dia] = partes;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Converte um input HTML `date` sem passar pela meia-noite do fuso local. */
export function inputParaDataCivil(valor: unknown) {
  if (valor === "" || valor == null) return null;
  if (typeof valor !== "string") return null;
  const partes = partesDataCivil(valor);
  if (!partes) return null;
  return criarDataCivil(partes);
}
