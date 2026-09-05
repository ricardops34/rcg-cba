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
];
