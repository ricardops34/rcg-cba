/**
 * Fronteira de dados entre a plataforma e a IA.
 *
 * Decisão do usuário (2026-08-14): **nenhum dado sensível ou de negócio sai
 * para a IA.** O modelo recebe apenas identificadores opacos — código de
 * cliente, códigos de CNAE e códigos de produto — procura padrão, e devolve
 * códigos de produto recomendados. O significado (descrição, preço, estoque,
 * histórico) é remontado *deste lado*, na leitura.
 *
 * | Vai | Não vai |
 * |---|---|
 * | código do cliente | razão social, nome fantasia, CNPJ, endereço, contato |
 * | códigos de CNAE | valores, faturamento, ticket, margem, comissão |
 * | códigos de produto | descrição de produto, preço, quantidade, estoque |
 *
 * Este arquivo é pequeno de propósito: é aqui que a regra vive, e é aqui que
 * ela pode ser quebrada sem ninguém notar — um `...cliente` distraído num
 * spread levaria a razão social junto. Por isso a montagem é **explícita campo
 * a campo**, nunca por espalhamento, e tem teste próprio
 * (`anonimizar.spec.ts`) que falha se um campo novo escapar.
 */

/** Entrada bruta, como sai do banco — com dados que NÃO podem sair daqui. */
export interface ClienteParaAnonimizar {
  id: string;
  codigoErp: string | null;
  razaoSocial?: string;
  nomeFantasia?: string | null;
  cnpjCpf?: string | null;
  municipio?: string | null;
  uf?: string | null;
  limiteCredito?: number | null;
  cnaes: { codigo: string | null }[];
  produtos: { codigoErp: string; valorTotal?: number }[];
}

/** O que efetivamente trafega. Só código. */
export interface ClienteAnonimo {
  ref: string;
  cnaes: string[];
  produtos: string[];
}

export interface PayloadAnonimo {
  alvo: ClienteAnonimo;
  comparaveis: ClienteAnonimo[];
}

/**
 * Rótulo opaco do cliente no payload. Não usamos o UUID nem o código do ERP:
 * um índice sequencial por requisição basta para o modelo correlacionar, não
 * atravessa requisições e não serve para nada fora deste contexto.
 */
const ref = (i: number) => `C${i}`;

function anonimizarCliente(
  cliente: ClienteParaAnonimizar,
  rotulo: string,
): ClienteAnonimo {
  return {
    ref: rotulo,
    // Campo a campo, e só o código. `filter` remove CNAE sem código na
    // referência — mandar null não ajuda o modelo e polui o payload.
    cnaes: cliente.cnaes
      .map((c) => c.codigo)
      .filter((c): c is string => !!c)
      .sort(),
    produtos: cliente.produtos.map((p) => p.codigoErp).sort(),
  };
}

/**
 * Monta o payload da consulta à IA. O mapa de volta (`ref` → clienteId) fica
 * **do lado de cá**: o modelo devolve códigos de produto, e é a plataforma que
 * sabe a quem pertencem.
 */
export function montarPayloadAnonimo(
  alvo: ClienteParaAnonimizar,
  comparaveis: ClienteParaAnonimizar[],
): PayloadAnonimo {
  return {
    alvo: anonimizarCliente(alvo, ref(0)),
    comparaveis: comparaveis.map((c, i) => anonimizarCliente(c, ref(i + 1))),
  };
}

/**
 * Campos que jamais podem aparecer no corpo enviado. Usado pelo teste e pela
 * checagem em tempo de execução — cinto e suspensório, porque o custo de um
 * vazamento aqui é alto e o de checar é irrisório.
 */
export const CAMPOS_PROIBIDOS = [
  'razaoSocial',
  'nomeFantasia',
  'cnpjCpf',
  'cnpj',
  'municipio',
  'uf',
  'endereco',
  'telefone',
  'email',
  'limiteCredito',
  'valorTotal',
  'valor',
  'preco',
  'quantidade',
  'descricao',
  'comissao',
  'margem',
] as const;

/**
 * Última barreira antes do envio: varre o JSON serializado atrás de qualquer
 * chave proibida. Lança em vez de mandar — falhar a sugestão é muito menos
 * grave do que vazar cadastro para um terceiro.
 */
export function garantirPayloadAnonimo(payload: unknown): void {
  const serializado = JSON.stringify(payload);
  const encontrados = CAMPOS_PROIBIDOS.filter((campo) =>
    serializado.includes(`"${campo}"`),
  );
  if (encontrados.length > 0) {
    throw new Error(
      `Payload para a IA contém campo proibido: ${encontrados.join(', ')}. ` +
        'Envio abortado — ver anonimizar.ts.',
    );
  }
}
