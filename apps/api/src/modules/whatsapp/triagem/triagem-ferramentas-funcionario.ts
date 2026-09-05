import type { FerramentaChat } from '../../agente/provedor-ia';

/**
 * Ferramentas do funcionário no número institucional.
 *
 * **Três catálogos, três interlocutores.** As de cliente
 * (`triagem-ferramentas.ts`) atendem quem está comprando; as do agente interno
 * (`agente-tools.service.ts`) atendem um funcionário **logado**, com permissão
 * de perfil conferida a cada chamada; estas atendem o funcionário no WhatsApp,
 * onde não há login nem permissão — só um telefone reconhecido e um código que
 * ele confirmou.
 *
 * Por isso **só leitura**, por decisão do usuário. Um celular perdido não pode
 * virar acesso de escrita, e é a diferença entre um vazamento incômodo e um
 * estrago no cadastro. Criar orçamento, mover oportunidade e atualizar
 * cadastro continuam sendo do agente interno, atrás de senha.
 *
 * Nenhuma recebe "de quem" como argumento. O escopo sai do vendedor dono do
 * número, resolvido pelo servidor com a mesma regra do sistema
 * (`resolverEscopoDoUsuario`): quem tem gente abaixo enxerga a equipe, quem não
 * tem enxerga a própria carteira. Se o modelo pudesse informar a carteira,
 * bastaria convencê-lo para ler a de outro.
 */
export const FERRAMENTAS_DO_FUNCIONARIO: FerramentaChat[] = [
  {
    nome: 'meus_titulos_vencidos',
    descricao:
      'Títulos a receber já vencidos na sua carteira (ou na da sua equipe, se ' +
      'você tem gente abaixo). Use para "quem está me devendo", "o que venceu", ' +
      '"inadimplência". Devolve cliente, vencimento, valor e dias de atraso, do ' +
      'mais antigo para o mais novo.',
    parametros: {
      type: 'object',
      properties: {
        quantidade: {
          type: 'integer',
          description: 'Quantos títulos trazer (1 a 20). Padrão 10.',
        },
      },
      required: [],
    },
  },
  {
    nome: 'minha_agenda',
    descricao:
      'Suas atividades em aberto: o que está agendado e o que já venceu. Use ' +
      'para "o que eu tenho hoje", "minha agenda", "o que está atrasado".',
    parametros: {
      type: 'object',
      properties: {
        dias: {
          type: 'integer',
          description:
            'Janela para a frente, em dias (0 a 30). Padrão 7. O que já venceu ' +
            'vem sempre, independente da janela.',
        },
      },
      required: [],
    },
  },
  {
    nome: 'situacao_do_cliente',
    descricao:
      'Situação de um cliente da sua carteira pelo nome: quanto ele deve, o ' +
      'que venceu e quando comprou pela última vez. Use quando perguntarem ' +
      'sobre um cliente específico ("como está o Mercado Silva?").',
    parametros: {
      type: 'object',
      properties: {
        nome: {
          type: 'string',
          description: 'Nome ou parte do nome/razão social do cliente',
        },
      },
      required: ['nome'],
    },
  },
  {
    nome: 'clientes_aguardando',
    descricao:
      'Quem está esperando atendimento no WhatsApp da empresa agora, e há ' +
      'quanto tempo. Use para "tem alguém esperando?", "como está a fila". ' +
      'Mostra só o que é da sua carteira ou da sua equipe.',
    parametros: { type: 'object', properties: {}, required: [] },
  },

  // --------------------------------------------------- acompanhamento
  //
  // As quatro abaixo servem principalmente a quem tem equipe, mas não são
  // exclusivas dele: um vendedor pergunta as mesmas coisas sobre a própria
  // carteira, e o recorte já resolve a diferença. Um catálogo separado por
  // cargo daria duas listas para manter e um "por que ele vê e eu não".

  {
    nome: 'acompanhar_objetivos',
    descricao:
      'Objetivo × realizado do mês. Sem nome, traz a equipe inteira (ou só ' +
      'você, se não tem gente abaixo); com o nome de alguém, traz só essa ' +
      'pessoa. Use para "como estamos na meta", "quanto falta pro Diego bater". ' +
      'Devolve valor, percentual, quanto falta e clientes positivados.',
    parametros: {
      type: 'object',
      properties: {
        vendedor: {
          type: 'string',
          description: 'Nome de quem acompanhar. Omita para ver a equipe toda.',
        },
        mes: { type: 'integer', description: 'Mês (1 a 12). Padrão: o atual.' },
        ano: { type: 'integer', description: 'Ano. Padrão: o atual.' },
      },
      required: [],
    },
  },
  {
    nome: 'resumo_de_atividades',
    descricao:
      'Como está a agenda em números: quantas atividades em aberto, quantas ' +
      'venceram, quantas vencem em 7 dias e quantas foram concluídas. Com ' +
      'equipe, mostra também quem está com mais atraso. Use para "como está a ' +
      'equipe", "tem muita coisa atrasada?". Para a LISTA de tarefas, use ' +
      'minha_agenda.',
    parametros: {
      type: 'object',
      properties: {
        dias: {
          type: 'integer',
          description: 'Janela para trás das concluídas (1 a 90). Padrão 30.',
        },
      },
      required: [],
    },
  },
  {
    nome: 'aniversariantes',
    descricao:
      'Quem faz aniversário nos próximos dias — clientes (padrão) ou a ' +
      'equipe. Use para "quem faz aniversário essa semana", "tem aniversário ' +
      'de cliente hoje". Devolve o dia e o telefone para dar os parabéns.',
    parametros: {
      type: 'object',
      properties: {
        de: {
          type: 'string',
          enum: ['clientes', 'equipe'],
          description: 'De quem. Padrão "clientes".',
        },
        dias: {
          type: 'integer',
          description: 'Janela para a frente (1 a 60). Padrão 7.',
        },
      },
      required: [],
    },
  },
  {
    nome: 'clientes_sem_compra_no_mes',
    descricao:
      'Clientes da carteira que ainda NÃO compraram neste mês, do que parou ' +
      'de comprar mais recentemente para o mais antigo, com sugestão do que ' +
      'oferecer a cada um. Use para "quem não comprou esse mês", "para quem eu ' +
      'ligo hoje", "o que ofereço pro fulano".',
    parametros: {
      type: 'object',
      properties: {
        quantidade: {
          type: 'integer',
          description: 'Quantos clientes trazer (1 a 20). Padrão 10.',
        },
      },
      required: [],
    },
  },
];
