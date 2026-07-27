import { z } from "zod";
import type { PoliticaSenha } from "@plataforma/contracts";

/** Monta um z.string() com os requisitos vigentes, para uso em zodResolver. */
export function buildSenhaSchema(politica: PoliticaSenha) {
  let schema = z.string().min(politica.tamanhoMinimo, `Mínimo de ${politica.tamanhoMinimo} caracteres`);
  if (politica.tamanhoMaximo) {
    schema = schema.max(politica.tamanhoMaximo, `Máximo de ${politica.tamanhoMaximo} caracteres`);
  }
  if (politica.exigirMaiuscula) {
    schema = schema.regex(/[A-Z]/, "Deve conter ao menos uma letra maiúscula");
  }
  if (politica.exigirMinuscula) {
    schema = schema.regex(/[a-z]/, "Deve conter ao menos uma letra minúscula");
  }
  if (politica.exigirNumero) {
    schema = schema.regex(/[0-9]/, "Deve conter ao menos um número");
  }
  if (politica.exigirEspecial) {
    schema = schema.regex(/[^A-Za-z0-9]/, "Deve conter ao menos um caractere especial");
  }
  return schema;
}

/** Lista amigável dos requisitos vigentes, para exibir acima dos campos de senha. */
export function describeRequisitos(politica: PoliticaSenha): string[] {
  const requisitos = [`Mínimo de ${politica.tamanhoMinimo} caracteres`];
  if (politica.tamanhoMaximo) requisitos.push(`Máximo de ${politica.tamanhoMaximo} caracteres`);
  if (politica.exigirMaiuscula) requisitos.push("Ao menos uma letra maiúscula");
  if (politica.exigirMinuscula) requisitos.push("Ao menos uma letra minúscula");
  if (politica.exigirNumero) requisitos.push("Ao menos um número");
  if (politica.exigirEspecial) requisitos.push("Ao menos um caractere especial");
  return requisitos;
}
