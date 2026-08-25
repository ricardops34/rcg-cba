/**
 * Fronteira de dados entre o chat do agente e o provedor de IA.
 *
 * Mesma regra que já vale para a sugestão de compra
 * (`sugestao-compra/anonimizar.ts`), agora no chat: **nome de cliente e de
 * produto não saem daqui.** O modelo recebe só o código, raciocina sobre
 * código, e a plataforma remonta os nomes na resposta — a partir do banco.
 *
 * | Vai | Não vai |
 * |---|---|
 * | código do cliente, do produto e do vendedor | razão social, nome fantasia, descrição do produto, nome do vendedor |
 * | valores, quantidades, datas, status | CNPJ/CPF, e-mail, telefone, endereço, contato |
 *
 * **Valores seguem** (decisão de 2026-08-25), e isso é deliberado: sem eles o
 * modelo fica cego para magnitude e não consegue ordenar, comparar ou somar —
 * que é metade do que se pergunta a ele. O provedor vê números sem saber de
 * quem são, porque o nome nunca viaja junto.
 *
 * ## Por que a referência é determinística
 *
 * A ref é derivada do próprio registro (`«CLI:1234»`, do código ERP), não de
 * um contador por conversa. Isso evita ter de guardar um mapa ref→id em algum
 * lugar e mantê-lo vivo entre turnos: para remontar, basta consultar a base
 * pelo código. É também o que permite gravar a mensagem do assistente **já
 * mascarada** — o histórico volta ao modelo no turno seguinte, e se ele fosse
 * gravado com os nomes reais eles vazariam por ali, pela porta dos fundos.
 *
 * Este arquivo é pequeno de propósito, e a mascaração é **por chave conhecida**
 * em vez de heurística sobre o texto: é aqui que a regra vive e é aqui que ela
 * pode ser quebrada sem ninguém notar. Tem teste próprio
 * (`anonimizar-agente.spec.ts`) que falha se um campo novo escapar.
 */

/** Formato da referência opaca. O `‹›` evita colisão com texto normal. */
export const RE_REFERENCIA = /«(CLI|PRD|VND):([^»]+)»/g;

export type TipoReferencia = 'CLI' | 'PRD' | 'VND';

/**
 * Campos **removidos** do payload, sem substituto.
 *
 * Não viram referência porque o agente não precisa deles para responder nada:
 * mandar mascarado só gastaria token e daria ao modelo um campo para citar.
 */
const CAMPOS_REMOVIDOS = new Set([
  'cnpjCpf',
  'cnpj',
  'cpf',
  'inscricaoEstadual',
  'inscricaoMunicipal',
  'rg',
  'email',
  'telefone',
  'telefone1',
  'telefone2',
  'celular',
  'site',
  'contato',
  'nomeContato',
  'endereco',
  'logradouro',
  'bairro',
  'complemento',
  'cep',
  'observacao',
  'observacoes',
  // Dado pessoal do titular, sem uso para responder pergunta comercial.
  'dataNascimento',
  // Coordenada é endereço exato disfarçado de número: sozinha ela localiza o
  // cliente na rua, o que nenhuma pergunta do agente precisa. `municipio` e
  // `uf` seguem, porque são grossos o bastante para não identificar e úteis
  // para filtrar ("clientes em Campo Grande").
  'latitude',
  'longitude',
]);

/** Campos que carregam o nome do cliente. */
const CAMPOS_NOME_CLIENTE = ['razaoSocial', 'nomeFantasia'];

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function primeiroTexto(
  obj: Record<string, unknown>,
  chaves: string[],
): string | null {
  for (const chave of chaves) {
    const v = obj[chave];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** `«CLI:1234»`, preferindo o código do ERP e caindo para o id interno. */
function referencia(
  tipo: TipoReferencia,
  obj: Record<string, unknown>,
): string | null {
  const chave = primeiroTexto(obj, ['codigoErp', 'codigo', 'id']);
  return chave ? `«${tipo}:${chave}»` : null;
}

/**
 * Que entidade este objeto representa?
 *
 * Decidido pelo **conjunto de chaves**, não por uma chave isolada: `descricao`
 * sozinha aparece em CNAE, categoria e condição de pagamento, e mascarar
 * aquelas quebraria a sugestão por ramo sem proteger nada — descrição de CNAE
 * não identifica cliente nenhum.
 */
function tipoDoObjeto(
  obj: Record<string, unknown>,
  chavePai: string | null,
): TipoReferencia | null {
  if ('razaoSocial' in obj || 'nomeFantasia' in obj) return 'CLI';

  if (
    'descricao' in obj &&
    ('produtoId' in obj ||
      'unidade' in obj ||
      'precoTabelaCliente' in obj ||
      chavePai === 'produto' ||
      chavePai === 'produtos')
  ) {
    return 'PRD';
  }

  if ((chavePai === 'vendedor' || chavePai === 'vendedores') && 'nome' in obj) {
    return 'VND';
  }

  return null;
}

/**
 * Substitui os campos de identificação pela referência opaca.
 *
 * Percorre a estrutura inteira: os resultados das ferramentas são JSON do
 * banco, com aninhamento imprevisível, e um cliente pode vir dentro de uma
 * nota, de um título ou de uma lista de semelhantes.
 */
export function mascarar(
  valor: unknown,
  chavePai: string | null = null,
): unknown {
  if (Array.isArray(valor)) {
    return valor.map((item) => mascarar(item, chavePai));
  }
  if (!ehObjeto(valor)) return valor;

  const tipo = tipoDoObjeto(valor, chavePai);
  const ref = tipo ? referencia(tipo, valor) : null;

  // O objeto do vendedor colapsa na própria referência: ali só há
  // identificação, e manter o invólucro produziria `vendedor: { vendedor:
  // "«VND:7»" }`. Cliente e produto continuam objetos porque carregam o que
  // interessa junto — valores, quantidades, datas.
  if (tipo === 'VND' && ref) return ref;

  const saida: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor)) {
    if (CAMPOS_REMOVIDOS.has(chave)) continue;

    if (ref && tipo === 'CLI' && CAMPOS_NOME_CLIENTE.includes(chave)) {
      // Só o primeiro nome vira referência; o segundo sai de cena para não
      // mandar a mesma entidade duas vezes.
      if (chave === 'razaoSocial' || !('razaoSocial' in valor)) {
        saida.cliente = ref;
      }
      continue;
    }
    if (ref && tipo === 'PRD' && chave === 'descricao') {
      saida.produto = ref;
      continue;
    }
    if (ref && tipo === 'VND' && chave === 'nome') {
      saida.vendedor = ref;
      continue;
    }

    saida[chave] = mascarar(v, chave);
  }

  return saida;
}

/**
 * Última barreira antes do envio, no espírito de `garantirPayloadAnonimo`:
 * varre o texto já serializado atrás de chave que não deveria ter sobrado.
 * Lança em vez de mandar — falhar a resposta é muito menos grave do que vazar
 * cadastro para um terceiro.
 */
export function garantirMascarado(serializado: string): void {
  const proibidos = ['razaoSocial', 'nomeFantasia', ...CAMPOS_REMOVIDOS].filter(
    (campo) => serializado.includes(`"${campo}"`),
  );

  if (proibidos.length > 0) {
    throw new Error(
      `Payload para a IA contém campo proibido: ${[...new Set(proibidos)].join(', ')}. ` +
        'Envio abortado — ver anonimizar-agente.ts.',
    );
  }
}

/** As referências citadas num texto, agrupadas por tipo. */
export function referenciasEm(texto: string): Record<TipoReferencia, string[]> {
  const achadas: Record<TipoReferencia, Set<string>> = {
    CLI: new Set(),
    PRD: new Set(),
    VND: new Set(),
  };
  for (const [, tipo, chave] of texto.matchAll(RE_REFERENCIA)) {
    achadas[tipo as TipoReferencia].add(chave);
  }
  return {
    CLI: [...achadas.CLI],
    PRD: [...achadas.PRD],
    VND: [...achadas.VND],
  };
}

/**
 * Troca as referências pelos nomes reais, no texto que o usuário vai ler.
 *
 * Referência sem correspondência no banco vira um aviso visível em vez de
 * sumir: se o modelo inventou um código, quem lê precisa perceber — apagar em
 * silêncio produziria uma frase que parece certa sobre um cliente que não
 * existe.
 */
export function remontar(
  texto: string,
  nomes: Record<TipoReferencia, Map<string, string>>,
): string {
  return texto.replace(
    RE_REFERENCIA,
    (inteiro, tipo: string, chave: string) => {
      const nome = nomes[tipo as TipoReferencia]?.get(chave);
      if (nome) return nome;
      const rotulo =
        tipo === 'CLI' ? 'cliente' : tipo === 'PRD' ? 'produto' : 'vendedor';
      return `[${rotulo} ${chave} não encontrado]`;
    },
  );
}
