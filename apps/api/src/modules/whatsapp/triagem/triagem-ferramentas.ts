import type { FerramentaChat } from '../../agente/provedor-ia';

/**
 * Ferramentas do atendimento institucional.
 *
 * **Não são as do agente interno**, e a diferença não é de conveniência: lá o
 * corte é a permissão do usuário logado, um funcionário da empresa. Aqui quem
 * está do outro lado é o **cliente**, e o corte é o cliente associado ao número
 * que mandou a mensagem. Reaproveitar o catálogo do agente interno daria a um
 * desconhecido no WhatsApp as ferramentas de um vendedor.
 *
 * Nenhuma delas recebe `clienteId` como argumento — o cliente vem do vínculo do
 * número, resolvido pelo servidor. Se a IA pudesse informar de quem quer os
 * títulos, bastaria ela se enganar (ou ser convencida) para vazar o financeiro
 * de outra empresa cliente.
 */

/** As que só existem quando o número já está associado a um cliente. */
export const FERRAMENTAS_DO_CLIENTE: FerramentaChat[] = [
  {
    nome: 'titulos_em_aberto',
    descricao:
      'Títulos a receber em aberto do cliente que está falando. Use quando ' +
      'perguntarem sobre boleto, fatura, cobrança, o que está devendo ou o que ' +
      'vence. Devolve vencimento, valor e situação.',
    parametros: { type: 'object', properties: {}, required: [] },
  },
  // A 2ª via de boleto **ainda não está aqui**, e é decisão, não esquecimento.
  //
  // `TitulosReceberService.gerarBoleto` recorta por carteira de vendedor
  // (`resolverEscopoVendedores`) e exige um usuário autenticado. O bot não tem
  // usuário, e o recorte certo para ele é outro: o cliente desta conversa.
  // Fabricar um `AuthenticatedUser` sintético para atravessar essa porta poria
  // um ator de escopo indefinido circulando por serviços que assumem uma
  // pessoa com carteira — é assim que nasce vazamento entre clientes.
  //
  // O caminho é extrair do gerador um recorte por cliente. Enquanto não
  // existir, a ferramenta não é oferecida ao modelo: descrevê-la e falhar na
  // execução faria a IA prometer o boleto antes do erro.
  {
    nome: 'ultimas_notas',
    descricao:
      'Últimas notas fiscais de venda do cliente que está falando. Use para ' +
      '"meu pedido chegou?", "o que eu comprei", "quando saiu a mercadoria".',
    parametros: {
      type: 'object',
      properties: {
        quantidade: {
          type: 'integer',
          description: 'Quantas trazer (1 a 10). Padrão 5.',
        },
      },
      required: [],
    },
  },
];

/** As que valem sempre, com ou sem cliente identificado. */
export const FERRAMENTAS_GERAIS: FerramentaChat[] = [
  {
    nome: 'identificar_cliente',
    descricao:
      'Procura um cliente pelo CNPJ/CPF ou pelo nome da empresa, quando o ' +
      'número de WhatsApp ainda não está associado a nenhum. Use assim que a ' +
      'pessoa disser de que empresa fala. NÃO associa nada — só confirma se ' +
      'existe, para você saber a quem direcionar.',
    parametros: {
      type: 'object',
      properties: {
        documento: {
          type: 'string',
          description: 'CNPJ ou CPF, só os dígitos, se a pessoa informar',
        },
        nome: {
          type: 'string',
          description: 'Nome ou razão social, se ela informar em vez do documento',
        },
      },
      required: [],
    },
  },
  {
    nome: 'procurar_vendedor',
    descricao:
      'Procura um vendedor ativo da empresa pelo nome, quando a pessoa disser ' +
      'com quem costuma falar. Use antes de direcionar.',
    parametros: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome, ou parte dele' },
      },
      required: ['nome'],
    },
  },
  {
    nome: 'direcionar_para_vendedor',
    descricao:
      'Encerra a triagem e entrega a conversa a um vendedor. Use quando souber ' +
      'a quem entregar: o vendedor da carteira do cliente identificado, ou o ' +
      'que a pessoa indicou pelo nome. Depois disto você não responde mais — ' +
      'quem continua é a pessoa. Escreva o assunto em uma linha, para ela ' +
      'chegar sabendo do que se trata.',
    parametros: {
      type: 'object',
      properties: {
        vendedorId: {
          type: 'string',
          description:
            'Id do vendedor, como devolvido por procurar_vendedor ou pelo ' +
            'contexto do cliente. Omita para cair na fila de quem estiver livre.',
        },
        assunto: {
          type: 'string',
          description: 'O que a pessoa quer, em uma linha',
        },
      },
      required: ['assunto'],
    },
  },
  {
    nome: 'avisar_equipe',
    descricao:
      'Manda um recado curto, pelo WhatsApp, para quem trabalha na empresa. ' +
      'Use quando o assunto não pode esperar a pessoa abrir o sistema: cliente ' +
      'aguardando fora do horário, urgência, retorno combinado para hoje. ' +
      'Escreva como quem avisa um colega: o que houve, de quem é, o que se ' +
      'espera. NÃO use para conversar nem para repassar o que o cliente disse ' +
      'inteiro — é um aviso, não um encaminhamento de conversa.',
    parametros: {
      type: 'object',
      properties: {
        destino: {
          type: 'string',
          enum: ['vendedor', 'supervisao'],
          description:
            '"vendedor" avisa o vendedor indicado em vendedorId (ou o da ' +
            'carteira do cliente); "supervisao" avisa gerentes e supervisores.',
        },
        vendedorId: {
          type: 'string',
          description:
            'Só com destino "vendedor" e quando não for o da carteira. Id ' +
            'devolvido por procurar_vendedor.',
        },
        mensagem: {
          type: 'string',
          description: 'O recado, em uma ou duas frases',
        },
      },
      required: ['destino', 'mensagem'],
    },
  },
  {
    nome: 'direcionar_para_administrativo',
    descricao:
      'Entrega a conversa ao pessoal administrativo, e não a um vendedor. Use ' +
      'para assunto que não é de venda: nota fiscal com erro, cobrança ' +
      'indevida, cadastro, reclamação. Depois disto você não responde mais.',
    parametros: {
      type: 'object',
      properties: {
        assunto: {
          type: 'string',
          description: 'O que a pessoa quer, em uma linha',
        },
      },
      required: ['assunto'],
    },
  },
];

/**
 * O catálogo que vai ao modelo, conforme o número esteja ou não associado.
 *
 * **Fail-closed**: sem cliente associado, as ferramentas do cliente nem são
 * descritas ao modelo. Descrevê-las e recusar na execução ensinaria a IA a
 * prometer o que não pode cumprir — e o cliente ouviria "vou te mandar o
 * boleto" antes do erro.
 */
export function ferramentasDaTriagem(temCliente: boolean): FerramentaChat[] {
  return temCliente
    ? [...FERRAMENTAS_DO_CLIENTE, ...FERRAMENTAS_GERAIS]
    : FERRAMENTAS_GERAIS;
}
