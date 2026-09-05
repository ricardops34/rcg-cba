import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantTx } from '../../../common/prisma/prisma.service';
import type { EscopoVendedores } from '../../../common/escopo/escopo-vendedores';
import { ITEM_DE_VENDA_WHERE } from '../../../common/vendas/venda-analitica';

/** Teto de linhas devolvidas ao modelo. Resposta de WhatsApp é curta. */
const MAX_LINHAS = 20;
const PADRAO_LINHAS = 10;

/** Janela padrão da agenda, para a frente. */
const AGENDA_DIAS_PADRAO = 7;

function reais(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function diasDesde(data: Date) {
  return Math.floor((Date.now() - data.getTime()) / 86_400_000);
}

/**
 * O recorte de carteira para as consultas em SQL cru (aniversariantes), onde
 * o `where` do Prisma não alcança.
 *
 * `Prisma.raw` na coluna é seguro **porque a coluna é literal do nosso código**
 * — nunca vem do modelo nem da requisição. Os ids do escopo vão como
 * parâmetros, que é onde entraria injeção.
 *
 * Escopo vazio vira `AND false`, e não "sem filtro": lista vazia significa
 * "não alcança ninguém", e omitir o filtro devolveria a empresa inteira.
 */
function escopoSql(escopo: EscopoVendedores, coluna: string): Prisma.Sql {
  if (escopo === null) return Prisma.empty;
  if (escopo.length === 0) return Prisma.sql`AND false`;
  return Prisma.sql`AND ${Prisma.raw(coluna)} IN (${Prisma.join(escopo)})`;
}

/**
 * Execução das ferramentas de consulta do funcionário no institucional.
 *
 * **O escopo nunca vem do modelo.** Todo método recebe o `EscopoVendedores` já
 * resolvido pelo servidor a partir de quem confirmou o número, e o aplica como
 * filtro obrigatório. `null` significa sem restrição de carteira (admin, ou
 * quem não tem cadastro de vendedor) — a mesma semântica do resto do sistema,
 * para não existir uma segunda definição de escopo só para o WhatsApp.
 */
@Injectable()
export class TriagemFuncionarioToolsService {
  /** Filtro de carteira reutilizado por todas as consultas. */
  private doEscopo(escopo: EscopoVendedores) {
    return escopo === null ? {} : { vendedorId: { in: escopo } };
  }

  async titulosVencidos(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    quantidade: number,
  ) {
    const take = Math.min(Math.max(quantidade || PADRAO_LINHAS, 1), MAX_LINHAS);
    const hoje = new Date();

    const linhas = await tx.tituloReceber.findMany({
      where: {
        empresaId,
        deletedAt: null,
        ativo: true,
        dtBaixa: null,
        vencimento: { lt: hoje },
        ...this.doEscopo(escopo),
      },
      orderBy: { vencimento: 'asc' },
      take,
      select: {
        numero: true,
        parcela: true,
        vencimento: true,
        saldo: true,
        cliente: { select: { nomeFantasia: true, razaoSocial: true } },
      },
    });

    // O total é de tudo que está vencido, não só das linhas trazidas: "quanto
    // tenho a receber" com o valor de 10 títulos seria uma resposta errada com
    // cara de certa.
    const total = await tx.tituloReceber.aggregate({
      where: {
        empresaId,
        deletedAt: null,
        ativo: true,
        dtBaixa: null,
        vencimento: { lt: hoje },
        ...this.doEscopo(escopo),
      },
      _sum: { saldo: true },
      _count: { _all: true },
    });

    return {
      totalVencido: reais(total._sum.saldo ?? 0),
      quantidadeTitulos: total._count._all,
      mostrando: linhas.length,
      titulos: linhas.map((t) => ({
        cliente:
          t.cliente?.nomeFantasia ?? t.cliente?.razaoSocial ?? 'sem cliente',
        titulo: t.parcela ? `${t.numero}/${t.parcela}` : t.numero,
        vencimento: t.vencimento?.toLocaleDateString('pt-BR'),
        diasAtraso: t.vencimento ? diasDesde(t.vencimento) : null,
        saldo: reais(t.saldo),
      })),
    };
  }

  async agenda(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    dias: number,
  ) {
    const janela = Math.min(Math.max(dias ?? AGENDA_DIAS_PADRAO, 0), 30);
    const ate = new Date(Date.now() + janela * 86_400_000);

    const linhas = await tx.atividade.findMany({
      where: {
        empresaId,
        deletedAt: null,
        concluida: false,
        // O vencido entra sempre: uma agenda que esconde o atraso porque ele
        // está fora da janela é pior que não ter agenda.
        dataVencimento: { lte: ate },
        ...this.doEscopo(escopo),
      },
      orderBy: { dataVencimento: 'asc' },
      take: MAX_LINHAS,
      select: {
        titulo: true,
        tipo: true,
        dataVencimento: true,
        cliente: { select: { nomeFantasia: true, razaoSocial: true } },
        vendedor: { select: { nome: true } },
      },
    });

    const agora = new Date();
    return {
      janelaDias: janela,
      total: linhas.length,
      atividades: linhas.map((a) => ({
        titulo: a.titulo,
        tipo: a.tipo,
        cliente: a.cliente?.nomeFantasia ?? a.cliente?.razaoSocial ?? null,
        // O nome do responsável só faz diferença para quem vê a equipe; para
        // o vendedor sozinho seria sempre ele mesmo, e vira ruído no prompt.
        responsavel:
          escopo === null || escopo.length > 1 ? a.vendedor.nome : undefined,
        vencimento: a.dataVencimento?.toLocaleDateString('pt-BR'),
        vencida: a.dataVencimento ? a.dataVencimento < agora : false,
      })),
    };
  }

  async situacaoDoCliente(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    nome: string,
  ) {
    const busca = nome.trim();
    if (busca.length < 3) {
      return { erro: 'Informe pelo menos 3 letras do nome do cliente' };
    }

    const clientes = await tx.cliente.findMany({
      where: {
        empresaId,
        deletedAt: null,
        ...this.doEscopo(escopo),
        OR: [
          { nomeFantasia: { contains: busca, mode: 'insensitive' } },
          { razaoSocial: { contains: busca, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: {
        id: true,
        nomeFantasia: true,
        razaoSocial: true,
        vendedor: { select: { nome: true } },
      },
    });

    if (clientes.length === 0) {
      return {
        encontrado: false,
        motivo: 'Nenhum cliente da sua carteira com esse nome',
      };
    }
    // Ambiguidade não adivinha: devolve as opções para o modelo perguntar qual.
    if (clientes.length > 1) {
      return {
        encontrado: false,
        motivo: 'Mais de um cliente com esse nome',
        opcoes: clientes.map((c) => c.nomeFantasia ?? c.razaoSocial),
      };
    }

    const cliente = clientes[0];
    const hoje = new Date();
    const [aberto, vencido, ultima] = await Promise.all([
      tx.tituloReceber.aggregate({
        where: {
          empresaId,
          clienteId: cliente.id,
          deletedAt: null,
          ativo: true,
          dtBaixa: null,
        },
        _sum: { saldo: true },
      }),
      tx.tituloReceber.aggregate({
        where: {
          empresaId,
          clienteId: cliente.id,
          deletedAt: null,
          ativo: true,
          dtBaixa: null,
          vencimento: { lt: hoje },
        },
        _sum: { saldo: true },
        _count: { _all: true },
      }),
      // Derivada das notas, e não de `clientes.ultimaCompra`: aquela coluna
      // não é mantida (83 de 83 clientes com nota e nenhum com o campo
      // preenchido nesta base), e lê-la faria a resposta dizer "sem compra
      // registrada" para quem compra todo mês.
      tx.notaSaidaItem.aggregate({
        where: {
          empresaId,
          clienteId: cliente.id,
          ...ITEM_DE_VENDA_WHERE,
        },
        _max: { dtEmissao: true },
      }),
    ]);

    return {
      encontrado: true,
      cliente: cliente.nomeFantasia ?? cliente.razaoSocial,
      vendedor: cliente.vendedor?.nome ?? null,
      ultimaCompra:
        ultima._max.dtEmissao?.toLocaleDateString('pt-BR') ??
        'sem compra registrada',
      emAberto: reais(aberto._sum.saldo ?? 0),
      vencido: reais(vencido._sum.saldo ?? 0),
      titulosVencidos: vencido._count._all,
    };
  }

  /**
   * A fila do número institucional, recortada pelo escopo.
   *
   * Conversa em `bot` fica de fora: ela ainda está com a IA e não é espera de
   * ninguém. `aguardando` sem dono aparece para todos do escopo — é justamente
   * quem ainda não foi direcionado a alguém.
   */
  async clientesAguardando(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
  ) {
    const linhas = await tx.whatsappConversa.findMany({
      where: {
        empresaId,
        atendimento: 'aguardando',
        sessao: { tipo: 'empresa' },
        ...(escopo === null
          ? {}
          : {
              OR: [
                { atendenteVendedorId: { in: escopo } },
                { atendenteVendedorId: null },
              ],
            }),
      },
      orderBy: { direcionadaEm: 'asc' },
      take: MAX_LINHAS,
      select: {
        assunto: true,
        direcionadaEm: true,
        atendenteVendedorId: true,
        contato: { select: { nomeExibicao: true, telefoneNormalizado: true } },
        cliente: { select: { nomeFantasia: true, razaoSocial: true } },
      },
    });

    // `atendenteVendedorId` é coluna solta, sem relação declarada no schema —
    // o nome vem numa consulta à parte, sobre os poucos ids da página.
    const ids = [
      ...new Set(
        linhas
          .map((c) => c.atendenteVendedorId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const vendedores = ids.length
      ? await tx.vendedor.findMany({
          where: { empresaId, id: { in: ids } },
          select: { id: true, nome: true },
        })
      : [];
    const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));

    const agora = Date.now();
    return {
      total: linhas.length,
      fila: linhas.map((c) => ({
        quem:
          c.cliente?.nomeFantasia ??
          c.cliente?.razaoSocial ??
          c.contato.nomeExibicao ??
          c.contato.telefoneNormalizado ??
          'desconhecido',
        assunto: c.assunto,
        esperandoMin: c.direcionadaEm
          ? Math.floor((agora - c.direcionadaEm.getTime()) / 60_000)
          : null,
        direcionadaA: c.atendenteVendedorId
          ? (nomePorId.get(c.atendenteVendedorId) ?? 'vendedor removido')
          : 'ninguém ainda',
      })),
    };
  }

  // ------------------------------------------------- acompanhamento gerencial

  /**
   * Objetivo × realizado do mês, por pessoa.
   *
   * **O realizado sai de `ITEM_DE_VENDA_WHERE`**, a mesma regra do Dashboard,
   * dos Objetivos e das Consultas. Reimplementar "o que conta como venda" aqui
   * daria um segundo número para a mesma pergunta — que é exatamente o
   * problema que aquele arquivo existe para ter resolvido, e o tipo de coisa
   * que ninguém percebe até a reunião de fechamento.
   */
  async objetivos(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    opcoes: { vendedor?: string; mes?: number; ano?: number },
  ) {
    const agora = new Date();
    const mes = opcoes.mes ?? agora.getMonth() + 1;
    const ano = opcoes.ano ?? agora.getFullYear();

    // Nome informado = acompanhamento individual. O id é resolvido **dentro do
    // escopo**: pedir pelo nome de quem não é da equipe não alcança ninguém.
    let filtro = this.doEscopo(escopo);
    if (opcoes.vendedor?.trim()) {
      const achados = await tx.vendedor.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          nome: { contains: opcoes.vendedor.trim(), mode: 'insensitive' },
          ...(escopo === null ? {} : { id: { in: escopo } }),
        },
        take: 2,
        select: { id: true, nome: true },
      });
      if (achados.length === 0) {
        return { erro: 'Ninguém da sua equipe com esse nome' };
      }
      if (achados.length > 1) {
        return {
          erro: 'Mais de uma pessoa com esse nome',
          opcoes: achados.map((v) => v.nome),
        };
      }
      filtro = { vendedorId: { in: [achados[0].id] } };
    }

    const [objetivos, vendas, positivados] = await Promise.all([
      tx.objetivoVendedorMes.findMany({
        where: { empresaId, deletedAt: null, ativo: true, mes, ano, ...filtro },
        select: {
          vendedorId: true,
          valor: true,
          numeroCliente: true,
          vendedor: { select: { nome: true } },
        },
      }),
      tx.notaSaidaItem.groupBy({
        by: ['vendedorId'],
        where: { empresaId, ...ITEM_DE_VENDA_WHERE, ano, mes, ...filtro },
        _sum: { vlrTotal: true, vlrDev: true },
      }),
      tx.notaSaidaItem.groupBy({
        by: ['vendedorId', 'clienteId'],
        where: {
          empresaId,
          ...ITEM_DE_VENDA_WHERE,
          ano,
          mes,
          clienteId: { not: null },
          ...filtro,
        },
      }),
    ]);

    // Devolução abate o faturado — é assim que o painel apura, e um realizado
    // sem esse abatimento seria maior que o do sistema.
    const realizadoPor = new Map(
      vendas.map((v) => [
        v.vendedorId,
        (v._sum.vlrTotal ?? 0) - (v._sum.vlrDev ?? 0),
      ]),
    );
    const positivadosPor = new Map<string, number>();
    for (const p of positivados) {
      if (!p.vendedorId) continue;
      positivadosPor.set(
        p.vendedorId,
        (positivadosPor.get(p.vendedorId) ?? 0) + 1,
      );
    }

    const linhas = objetivos.map((o) => {
      const realizado = realizadoPor.get(o.vendedorId) ?? 0;
      return {
        vendedor: o.vendedor.nome,
        objetivo: reais(o.valor),
        realizado: reais(realizado),
        percentual:
          o.valor > 0 ? `${Math.round((realizado / o.valor) * 100)}%` : null,
        faltam:
          o.valor > realizado ? reais(o.valor - realizado) : 'meta batida',
        clientesPositivados: positivadosPor.get(o.vendedorId) ?? 0,
        objetivoClientes: o.numeroCliente ?? null,
      };
    });

    // Quem vendeu no mês mas não tem meta cadastrada não pode sumir: para o
    // gerente, "não aparece" é indistinguível de "não vendeu".
    const semMeta = [...realizadoPor.entries()].filter(
      ([id]) => !objetivos.some((o) => o.vendedorId === id),
    );

    const totalObjetivo = objetivos.reduce((soma, o) => soma + o.valor, 0);
    const totalRealizado = [...realizadoPor.values()].reduce(
      (a, b) => a + b,
      0,
    );

    return {
      periodo: `${String(mes).padStart(2, '0')}/${ano}`,
      totalObjetivo: reais(totalObjetivo),
      totalRealizado: reais(totalRealizado),
      totalPercentual:
        totalObjetivo > 0
          ? `${Math.round((totalRealizado / totalObjetivo) * 100)}%`
          : null,
      porVendedor: linhas.sort((a, b) => a.vendedor.localeCompare(b.vendedor)),
      semMetaCadastrada: semMeta.length,
    };
  }

  /**
   * Resumo das atividades do escopo: o que está em aberto, o que venceu e o
   * que foi concluído no período.
   *
   * Números, não lista: a lista é a `minha_agenda`. Aqui a pergunta é "como
   * está a equipe", e vinte linhas de tarefa não respondem isso no WhatsApp.
   */
  async resumoAtividades(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    dias: number,
  ) {
    const janela = Math.min(Math.max(dias || 30, 1), 90);
    const desde = new Date(Date.now() - janela * 86_400_000);
    const agora = new Date();
    const base = { empresaId, deletedAt: null, ...this.doEscopo(escopo) };

    const [porTipo, vencidas, concluidas, aVencer, porVendedor] =
      await Promise.all([
        tx.atividade.groupBy({
          by: ['tipo'],
          where: { ...base, concluida: false },
          _count: { _all: true },
        }),
        tx.atividade.count({
          where: { ...base, concluida: false, dataVencimento: { lt: agora } },
        }),
        tx.atividade.count({
          where: { ...base, concluida: true, dataConclusao: { gte: desde } },
        }),
        tx.atividade.count({
          where: {
            ...base,
            concluida: false,
            dataVencimento: {
              gte: agora,
              lte: new Date(Date.now() + 7 * 86_400_000),
            },
          },
        }),
        tx.atividade.groupBy({
          by: ['vendedorId'],
          where: { ...base, concluida: false, dataVencimento: { lt: agora } },
          _count: { _all: true },
        }),
      ]);

    // Quem está com o atraso só interessa a quem vê a equipe. Para o vendedor
    // sozinho seria sempre ele, e vira ruído no prompt.
    let atrasoPorPessoa: { vendedor: string; vencidas: number }[] | undefined;
    if ((escopo === null || escopo.length > 1) && porVendedor.length > 0) {
      const nomes = await tx.vendedor.findMany({
        where: { empresaId, id: { in: porVendedor.map((v) => v.vendedorId) } },
        select: { id: true, nome: true },
      });
      const nomePorId = new Map(nomes.map((n) => [n.id, n.nome]));
      atrasoPorPessoa = porVendedor
        .map((v) => ({
          vendedor: nomePorId.get(v.vendedorId) ?? 'removido',
          vencidas: v._count._all,
        }))
        .sort((a, b) => b.vencidas - a.vencidas);
    }

    return {
      janelaDias: janela,
      emAberto: porTipo.reduce((soma, t) => soma + t._count._all, 0),
      vencidas,
      venceEm7Dias: aVencer,
      concluidasNoPeriodo: concluidas,
      porTipo: porTipo.map((t) => ({
        tipo: t.tipo,
        quantidade: t._count._all,
      })),
      atrasoPorPessoa,
    };
  }

  /**
   * Aniversariantes dos próximos dias — de clientes ou da equipe.
   *
   * A comparação é por `MM-DD`, e não por data: aniversário se repete todo
   * ano, e comparar datas exigiria construir a ocorrência deste ano para cada
   * linha. A lista de dias é montada aqui e vai inteira para o banco, o que
   * também resolve a virada de mês e de ano sem nenhum caso especial.
   */
  async aniversariantes(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    opcoes: { de?: string; dias?: number },
  ) {
    const janela = Math.min(Math.max(opcoes.dias || 7, 1), 60);
    const chaves: string[] = [];
    for (let i = 0; i < janela; i++) {
      const d = new Date(Date.now() + i * 86_400_000);
      chaves.push(
        `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      );
    }
    // 29/02 não existe fora do ano bissexto: sem isto, quem nasceu nesse dia
    // nunca apareceria. Quando a janela cobre 01/03 de um ano não bissexto, o
    // aniversário é considerado ali — é o que o calendário civil faz.
    const ano = new Date().getFullYear();
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    if (!bissexto && chaves.includes('03-01')) chaves.push('02-29');

    if (opcoes.de === 'equipe') {
      const pessoas = await tx.$queryRaw<
        { nome: string; nascimento: Date; telefone: string | null }[]
      >`
        SELECT nome, "dataNascimento" AS nascimento, telefone
        FROM vendedores
        WHERE "empresaId" = ${empresaId}
          AND "deletedAt" IS NULL
          AND ativo
          AND "dataNascimento" IS NOT NULL
          AND to_char("dataNascimento", 'MM-DD') = ANY(${chaves})
          ${escopoSql(escopo, 'id')}
        ORDER BY to_char("dataNascimento", 'MM-DD')
        LIMIT 50`;
      return {
        de: 'equipe',
        janelaDias: janela,
        total: pessoas.length,
        aniversariantes: pessoas.map((p) => ({
          nome: p.nome,
          dia: p.nascimento.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
          }),
          telefone: p.telefone,
        })),
      };
    }

    const clientes = await tx.$queryRaw<
      {
        nome: string;
        nascimento: Date;
        telefone: string | null;
        vendedor: string | null;
      }[]
    >`
      SELECT COALESCE(c."nomeFantasia", c."razaoSocial") AS nome,
             c."dataNascimento" AS nascimento,
             COALESCE(c.celular, c.telefone) AS telefone,
             v.nome AS vendedor
      FROM clientes c
      LEFT JOIN vendedores v ON v.id = c."vendedorId"
      WHERE c."empresaId" = ${empresaId}
        AND c."deletedAt" IS NULL
        AND c.ativo
        AND c."dataNascimento" IS NOT NULL
        AND to_char(c."dataNascimento", 'MM-DD') = ANY(${chaves})
        ${escopoSql(escopo, 'c."vendedorId"')}
      ORDER BY to_char(c."dataNascimento", 'MM-DD')
      LIMIT 50`;

    return {
      de: 'clientes',
      janelaDias: janela,
      total: clientes.length,
      // `dataNascimento` do cliente só é preenchida em pessoa física. Lista
      // vazia numa carteira de CNPJ é o esperado, não falha de consulta — e o
      // modelo precisa saber disso para não dizer "não encontrei" como se
      // fosse um erro.
      observacao:
        clientes.length === 0
          ? 'Nenhum. A data de nascimento só existe em cliente pessoa física.'
          : undefined,
      aniversariantes: clientes.map((c) => ({
        cliente: c.nome,
        dia: c.nascimento.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
        }),
        telefone: c.telefone,
        vendedor: c.vendedor,
      })),
    };
  }

  /**
   * Clientes da carteira sem compra no mês, com o que sugerir a cada um.
   *
   * "Sem compra no mês" é o contrário de **positivado**, o mesmo indicador das
   * Consultas — e usa o mesmo `ITEM_DE_VENDA_WHERE`, então a conta bate com a
   * do painel.
   *
   * A ordem é por última compra, do mais recente para o mais antigo: quem
   * comprava e parou este mês é a ligação que vale a pena fazer hoje. Quem não
   * compra há dois anos é outra conversa.
   */
  async clientesSemCompraNoMes(
    tx: TenantTx,
    empresaId: string,
    escopo: EscopoVendedores,
    quantidade: number,
  ) {
    const take = Math.min(Math.max(quantidade || PADRAO_LINHAS, 1), MAX_LINHAS);
    const agora = new Date();
    const mes = agora.getMonth() + 1;
    const ano = agora.getFullYear();

    const positivados = await tx.notaSaidaItem.groupBy({
      by: ['clienteId'],
      where: {
        empresaId,
        ...ITEM_DE_VENDA_WHERE,
        ano,
        mes,
        clienteId: { not: null },
        ...this.doEscopo(escopo),
      },
    });
    const jaCompraram = positivados
      .map((p) => p.clienteId)
      .filter((id): id is string => id !== null);

    // A última compra é **derivada das notas**, e não lida de
    // `clientes.ultimaCompra`.
    //
    // Aquela coluna existe mas não é mantida: nesta base, 83 de 83 clientes
    // têm nota e **nenhum** tem `ultimaCompra` preenchida (só `primeiraCompra`).
    // Ler dali faria a ferramenta dizer "nunca comprou" para quem compra todo
    // mês — e ordenar por ela colocaria os clientes menos promissores no topo.
    // É também o que `ClientesService` e o agente interno já fazem.
    const ultimasCompras = await tx.notaSaidaItem.groupBy({
      by: ['clienteId'],
      where: {
        empresaId,
        ...ITEM_DE_VENDA_WHERE,
        clienteId: { not: null },
        ...this.doEscopo(escopo),
      },
      _max: { dtEmissao: true },
    });
    const ultimaPorCliente = new Map(
      ultimasCompras
        .filter((u) => u.clienteId !== null)
        .map((u) => [u.clienteId as string, u._max.dtEmissao]),
    );

    const candidatos = await tx.cliente.findMany({
      where: {
        empresaId,
        deletedAt: null,
        ativo: true,
        ...this.doEscopo(escopo),
        ...(jaCompraram.length > 0 ? { id: { notIn: jaCompraram } } : {}),
      },
      select: {
        id: true,
        nomeFantasia: true,
        razaoSocial: true,
        celular: true,
        telefone: true,
        vendedor: { select: { nome: true } },
      },
    });

    // Quem parou de comprar mais recentemente primeiro; quem nunca comprou por
    // último — é outra conversa, e não a ligação de hoje.
    const clientes = candidatos
      .map((c) => ({ ...c, ultimaCompra: ultimaPorCliente.get(c.id) ?? null }))
      .sort(
        (a, b) =>
          (b.ultimaCompra?.getTime() ?? 0) - (a.ultimaCompra?.getTime() ?? 0),
      )
      .slice(0, take);

    // A sugestão vem da rotina que já existe (Sugestão de Compra): o que
    // clientes parecidos compram e este ainda não. Cliente sem sugestão
    // gerada aparece do mesmo jeito — a ligação continua valendo.
    const sugestoes = clientes.length
      ? await tx.sugestaoCompraGerada.findMany({
          where: { empresaId, clienteId: { in: clientes.map((c) => c.id) } },
          orderBy: { ordem: 'asc' },
          select: {
            clienteId: true,
            produto: { select: { descricao: true } },
          },
        })
      : [];

    const sugestaoPorCliente = new Map<string, string[]>();
    for (const s of sugestoes) {
      const atual = sugestaoPorCliente.get(s.clienteId) ?? [];
      if (atual.length < 3) atual.push(s.produto.descricao);
      sugestaoPorCliente.set(s.clienteId, atual);
    }

    return {
      periodo: `${String(mes).padStart(2, '0')}/${ano}`,
      positivadosNoMes: jaCompraram.length,
      // O total é de todos os que não compraram, não o tamanho da página: o
      // gerente pergunta "quantos faltam", e devolver 10 porque a página tem
      // 10 seria uma resposta errada com cara de certa.
      semCompra: candidatos.length,
      mostrando: clientes.length,
      clientes: clientes.map((c) => ({
        cliente: c.nomeFantasia ?? c.razaoSocial,
        ultimaCompra:
          c.ultimaCompra?.toLocaleDateString('pt-BR') ?? 'nunca comprou',
        // Nota pode vir com emissão futura (a base de dev tem, e ERP às vezes
        // emite adiantado). "Dias sem comprar" negativo não quer dizer nada, e
        // o modelo repetiria o número como se quisesse — melhor omitir.
        diasSemComprar:
          c.ultimaCompra && c.ultimaCompra <= new Date()
            ? diasDesde(c.ultimaCompra)
            : null,
        telefone: c.celular ?? c.telefone,
        vendedor: c.vendedor?.nome ?? null,
        sugestao: sugestaoPorCliente.get(c.id) ?? [],
      })),
    };
  }
}
