import { BadRequestException } from '@nestjs/common';
import type { ProdutoCampoTipo } from '@plataforma/contracts';

/**
 * Texto digitado → formato canônico do tipo, ou erro.
 *
 * Isto é a única defesa do cadastro. O valor é gravado como texto, então sem
 * esta conversão o campo "peso" aceitaria "mais ou menos 12", e quem lê depois
 * — a tela, a IA falando do produto, um relatório — teria de adivinhar.
 *
 * O canônico existe para que ninguém precise interpretar: número com ponto
 * decimal, booleano `true`/`false`, data `AAAA-MM-DD`. Na **entrada** aceita o
 * jeito de digitar em português (vírgula decimal, data com barras, "sim"),
 * porque quem preenche não deve ter de conhecer o formato de armazenamento.
 *
 * Fica em módulo próprio, e não dentro do service, para poder ser testado
 * direto — é a regra mais fácil de quebrar sem ninguém perceber.
 */
export function normalizarValorDoCampo(
  tipo: ProdutoCampoTipo,
  opcoes: string[],
  valor: string,
  nome: string,
): string {
  switch (tipo) {
    case 'numero':
      return numero(valor, nome);
    case 'booleano':
      return booleano(valor, nome);
    case 'data':
      return data(valor, nome);
    case 'lista':
      return lista(valor, opcoes, nome);
    default:
      return valor;
  }
}

function numero(valor: string, nome: string) {
  // "1.234,5" é como se digita aqui: o ponto é separador de milhar e a vírgula
  // é a decimal. `Number("1.234,5")` daria NaN, e `Number("1.234")` daria
  // mil vezes menos do que a pessoa quis dizer.
  const semMilhar = /,/.test(valor)
    ? valor.replace(/\./g, '').replace(',', '.')
    : valor;
  const n = Number(semMilhar.replace(/\s/g, ''));
  if (!Number.isFinite(n)) {
    throw new BadRequestException(`${nome}: informe um número`);
  }
  return String(n);
}

function booleano(valor: string, nome: string) {
  const baixo = valor.toLowerCase();
  if (['true', 'sim', 's', '1', 'x'].includes(baixo)) return 'true';
  if (['false', 'não', 'nao', 'n', '0'].includes(baixo)) return 'false';
  throw new BadRequestException(`${nome}: informe sim ou não`);
}

function data(valor: string, nome: string) {
  // Aceita o que o `<input type="date">` manda (ISO) e o que alguém digita.
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : valor;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new BadRequestException(`${nome}: informe uma data`);
  }
  // `new Date('2026-02-31')` não é inválida em JS: ela **rola** para 03/03.
  // Sem comparar a volta, 31/02 entraria no cadastro como se existisse.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) {
    throw new BadRequestException(`${nome}: data inválida`);
  }
  return iso;
}

function lista(valor: string, opcoes: string[], nome: string) {
  // Compara sem diferenciar maiúscula, mas grava a opção **como cadastrada** —
  // senão o mesmo valor aparece de três jeitos ao filtrar por ele depois.
  const escolha = opcoes.find((o) => o.toLowerCase() === valor.toLowerCase());
  if (!escolha) {
    throw new BadRequestException(
      `${nome}: escolha uma das opções (${opcoes.join(', ')})`,
    );
  }
  return escolha;
}
