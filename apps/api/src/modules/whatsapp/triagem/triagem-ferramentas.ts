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
  // A 2ª via de boleto entrou em 2026-09-05, quando o recorte por cliente
  // passou a existir (`QuemPede`, em common/escopo/quem-pede.ts).
  //
  // A ressalva que estava escrita aqui continua valendo como regra: o bot não
  // fabrica um `AuthenticatedUser` sintético para atravessar o gerador. Ele
  // diz de qual cliente está falando, e o serviço recorta por isso — mesmo
  // gerador, mesmas travas (título baixado, janela de 30 dias, encargos do
  // vencido), outro recorte.
  {
    nome: 'segunda_via_boleto',
    descricao:
      'Manda o boleto de um título em aberto do cliente, em PDF. Use depois de ' +
      'titulos_em_aberto, quando a pessoa disser qual quer ("me manda o boleto ' +
      'do que vence dia 10"). Vencido sai com o valor já atualizado. Não há 2ª ' +
      'via de título pago, nem de vencido há mais de 30 dias — nesse caso ' +
      'direcione para o administrativo.',
    parametros: {
      type: 'object',
      properties: {
        numeroTitulo: {
          type: 'string',
          description:
            'O número do título, exatamente como titulos_em_aberto devolveu.',
        },
      },
      required: ['numeroTitulo'],
    },
  },
  {
    nome: 'copia_da_nota',
    descricao:
      'Manda a 2ª via do DANFE de uma nota fiscal do cliente, em PDF. Use ' +
      'depois de ultimas_notas, quando pedirem "a cópia da nota", "o DANFE", ' +
      '"a nota do último pedido".',
    parametros: {
      type: 'object',
      properties: {
        numeroNota: {
          type: 'string',
          description: 'O número da nota, como ultimas_notas devolveu.',
        },
      },
      required: ['numeroNota'],
    },
  },
  {
    nome: 'meus_pedidos',
    descricao:
      'Últimos pedidos (orçamentos) do cliente que está falando, com número, ' +
      'data, situação e valor. Use para "quais foram meus últimos pedidos", ' +
      '"o que eu pedi mês passado". Para a nota fiscal, use ultimas_notas.',
    parametros: {
      type: 'object',
      properties: {
        quantidade: {
          type: 'integer',
          description: 'Quantos trazer (1 a 10). Padrão 5.',
        },
      },
      required: [],
    },
  },
  {
    nome: 'copia_do_pedido',
    descricao:
      'Manda a cópia de um pedido (orçamento) do cliente em PDF, com itens, ' +
      'quantidades e preços. Use depois de meus_pedidos, quando pedirem "a ' +
      'cópia do pedido", "o que eu pedi mesmo".',
    parametros: {
      type: 'object',
      properties: {
        numeroPedido: {
          type: 'string',
          description: 'O número do pedido, como meus_pedidos devolveu.',
        },
      },
      required: ['numeroPedido'],
    },
  },
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
  // `procurar_vendedor` mudou de catálogo em 2026-09-05, por segurança.
  //
  // Estava entre as gerais, e ali qualquer número — inclusive o de um
  // concorrente que descobriu o WhatsApp da empresa — podia sondar nomes e
  // levantar a equipe de vendas inteira, um palpite por vez. Um cliente já
  // associado dizendo "falo com o João" é outra conversa: ele já sabe com quem
  // fala.
  //
  // Para quem não é cliente, direcionar sem nome continua funcionando: a IA usa
  // `direcionar_para_vendedor` sem `vendedorId` e a conversa cai para quem
  // estiver livre.
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
          description:
            'Nome ou razão social, se ela informar em vez do documento',
        },
      },
      required: [],
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
  // Captação de lead — a única ferramenta geral que **escreve**.
  //
  // Fica entre as gerais porque é justamente quem ainda não é cliente que
  // interessa captar. O risco de dar escrita a um número desconhecido é real, e
  // está contido em três pontos: um lead por conversa (índice único), nenhum
  // dado é verificado — tudo é "o que a pessoa disse" —, e o registro não toca
  // cadastro nenhum: vive numa tabela própria até alguém decidir o que fazer.
  {
    nome: 'registrar_lead',
    descricao:
      'Anota quem procurou a empresa e o que quer, para a supervisão dar ' +
      'sequência. Use quando a pessoa NÃO é cliente e demonstrou interesse — ' +
      'perguntou preço, prazo, se atendem a região dela, como comprar. Pode ' +
      'chamar de novo na mesma conversa para completar o que descobriu depois: ' +
      'o registro é atualizado, não duplicado.',
    parametros: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome de quem está falando' },
        empresa: {
          type: 'string',
          description: 'Empresa que ela disse representar',
        },
        documento: {
          type: 'string',
          description: 'CNPJ ou CPF, só dígitos, se ela informar',
        },
        interesse: {
          type: 'string',
          description:
            'O que ela procura, em uma linha. Escreva o que ela disse, não o que você supõe.',
        },
        temperatura: {
          type: 'string',
          enum: ['quente', 'morno', 'frio'],
          description:
            '"quente" = quer comprar agora e disse o quê; "morno" = interesse real sem urgência; ' +
            '"frio" = só perguntou, sem sinal de compra. Na dúvida, "morno".',
        },
        motivo: {
          type: 'string',
          description:
            'Por que você classificou assim, em uma frase. Quem receber o lead precisa poder discordar.',
        },
      },
      required: ['interesse'],
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
  // Produto: fala das características, nunca do preço.
  //
  // A regra é do usuário, e é **código**: `ProdutoParaAgenteService` não lê a
  // coluna de preço, e o texto das fichas passa por `semPreco`. O modelo não
  // recebe preço, então não há o que ele possa deixar escapar. Uma instrução de
  // prompt aqui seria exatamente o tipo de garantia que este projeto não aceita.
  //
  // Fica entre as **gerais**, e isso foi decidido: o agente é o
  // pré-atendimento do número institucional, e pré-atendimento atende quem
  // chega — cliente ou não. Quem pergunta "vocês têm produto para limpar
  // piso?" quase nunca já é cliente; é justamente o lead que a conversa
  // seguinte registra.
  //
  // O que se aceita ao liberar: quem tem o número passa a poder consultar o
  // catálogo, e um concorrente é um deles. É material comercial — o mesmo que
  // um vendedor conta ao telefone — e nada aqui é dado de pessoa: sem preço,
  // sem estoque, sem cliente. O que **não** se aceita continua fechado, e é o
  // que o `seguranca.spec.ts` prende.
  {
    nome: 'sobre_produto',
    descricao:
      'Características de produtos do catálogo: descrição, marca, embalagem, ' +
      'dados técnicos (diluição, dimensões, validade), o que está na ficha ' +
      'técnica, similares e produtos usados na aplicação. ' +
      'Use de dois jeitos: quando perguntarem sobre um produto ("o que é o X", ' +
      '"qual a diluição", "tem substituto") e quando descreverem uma ' +
      'necessidade ("preciso de algo para limpar piso de cozinha") — neste ' +
      'caso a busca procura também nas características e nas fichas, e você ' +
      'recebe os candidatos detalhados para comparar e indicar. ' +
      'NÃO devolve preço, e não existe outro jeito de obtê-lo: se perguntarem ' +
      'preço, explique que o orçamento é feito por um vendedor e ofereça ' +
      'direcionar a conversa.',
    parametros: {
      type: 'object',
      properties: {
        busca: {
          type: 'string',
          description:
            'Nome, marca, código — ou a necessidade que a pessoa descreveu, ' +
            'com as palavras dela',
        },
      },
      required: ['busca'],
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
