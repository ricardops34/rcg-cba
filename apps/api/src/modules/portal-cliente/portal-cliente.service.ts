import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PortalClienteUser } from './portal-cliente-auth.types';

@Injectable()
export class PortalClienteService {
  constructor(private readonly prisma: PrismaService) {}

  private exigir(user: PortalClienteUser, permissao: string) {
    if (!user.permissoes.includes(permissao)) {
      throw new ForbiddenException('Rotina não habilitada para este acesso');
    }
  }

  me(user: PortalClienteUser) {
    return this.prisma.withTenant(user.empresaId, async (tx) => {
      const contato = await tx.clienteContato.findFirst({
        where: { id: user.contatoId, empresaId: user.empresaId, clienteId: user.clienteId, ativo: true },
        include: { cliente: true, empresa: true },
      });
      const config = await tx.portalClienteConfig.findUnique({ where: { empresaId: user.empresaId } });
      if (!contato || !config) throw new NotFoundException('Acesso ao portal não encontrado');
      return {
        contato: { id: contato.id, nome: contato.nome, email: contato.email },
        cliente: {
          id: contato.cliente.id,
          razaoSocial: contato.cliente.razaoSocial,
          nomeFantasia: contato.cliente.nomeFantasia,
        },
        empresa: {
          id: contato.empresa.id,
          nomeFantasia: contato.empresa.nomeFantasia,
          logoUrl: contato.empresa.logoUrl,
        },
        permissoes: user.permissoes,
        config,
      };
    });
  }

  listarOrcamentos(user: PortalClienteUser) {
    this.exigir(user, 'orcamentos.visualizar');
    return this.prisma.withTenant(user.empresaId, (tx) =>
      tx.orcamento.findMany({
        where: {
          empresaId: user.empresaId,
          clienteId: user.clienteId,
          ativo: true,
          deletedAt: null,
          status: { in: ['enviado', 'aprovado', 'recusado', 'expirado'] },
        },
        select: {
          id: true,
          numero: true,
          titulo: true,
          status: true,
          dataValidade: true,
          vlrTotal: true,
          observacao: true,
          clienteDecididoEm: true,
          clienteDecisao: true,
          clienteDecisaoObservacao: true,
          vendedor: { select: { nome: true } },
          condicaoPagamento: { select: { descricao: true } },
          itens: {
            select: {
              id: true,
              quantidade: true,
              vlrUnitario: true,
              vlrTotal: true,
              percDesconto: true,
              produto: { select: { codigoErp: true, descricao: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  decidirOrcamento(user: PortalClienteUser, id: string, decisao: 'aprovado' | 'recusado', observacao?: string) {
    this.exigir(user, decisao === 'aprovado' ? 'orcamentos.aprovar' : 'orcamentos.recusar');
    return this.prisma.withTenant(user.empresaId, async (tx) => {
      const atual = await tx.orcamento.findFirst({
        where: { id, empresaId: user.empresaId, clienteId: user.clienteId, ativo: true, deletedAt: null },
      });
      if (!atual) throw new NotFoundException('Orçamento não encontrado');
      if (atual.status === decisao && atual.clienteDecididoEm) return atual;
      if (atual.status !== 'enviado') {
        throw new ConflictException('Somente um orçamento enviado pode receber a decisão do cliente');
      }
      if (atual.dataValidade && atual.dataValidade < new Date()) {
        await tx.orcamento.update({ where: { id: atual.id }, data: { status: 'expirado' } });
        throw new ConflictException('O orçamento está vencido');
      }

      const agora = new Date();
      const atualizado = await tx.orcamento.update({
        where: { id: atual.id },
        data: {
          status: decisao,
          clienteDecididoEm: agora,
          clienteDecididoPorContatoId: user.contatoId,
          clienteDecisao: decisao,
          clienteDecisaoObservacao: observacao?.trim() || null,
          updatedBy: `portal-cliente:${user.contatoId}`,
        },
      });
      await tx.atividade.create({
        data: {
          empresaId: user.empresaId,
          clienteId: user.clienteId,
          orcamentoId: atual.id,
          vendedorId: atual.vendedorId,
          tipo: 'tarefa',
          titulo: `Orçamento #${atual.numero} ${decisao} pelo cliente`,
          descricao: observacao?.trim() || `Decisão registrada por ${user.nome} (${user.email}).`,
          concluida: true,
          dataConclusao: agora,
          createdBy: `portal-cliente:${user.contatoId}`,
        },
      });
      return atualizado;
    });
  }
}
