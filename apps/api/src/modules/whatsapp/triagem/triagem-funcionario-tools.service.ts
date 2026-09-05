import { Injectable } from '@nestjs/common';
import type { TenantTx } from '../../../common/prisma/prisma.service';
import type { EscopoVendedores } from '../../../common/escopo/escopo-vendedores';

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
        ultimaCompra: true,
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
    const [aberto, vencido] = await Promise.all([
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
    ]);

    return {
      encontrado: true,
      cliente: cliente.nomeFantasia ?? cliente.razaoSocial,
      vendedor: cliente.vendedor?.nome ?? null,
      ultimaCompra:
        cliente.ultimaCompra?.toLocaleDateString('pt-BR') ??
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
}
