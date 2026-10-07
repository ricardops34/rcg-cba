import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ComodatoBaixaCriar } from '@plataforma/contracts';
import {
  PrismaService,
  Prisma,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { saldoComodatoSql } from './comodato-sql';

const qtd = (v: number) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/**
 * Baixa de comodato: o saldo de um equipamento num cliente que deixa de
 * contar (ver ComodatoBaixa e docs/planos/equipamentos-comodato.md).
 *
 * Quem pode: quem tem acesso ao cliente (decisão do usuário, 2026-10-07) — a
 * rota pede `posicao-cliente.visualizar`, e aqui o cliente precisa estar na
 * carteira de quem pede. Baixar e desfazer viram atividade no histórico de
 * atendimento do cliente, em nome do vendedor dele, com o nome de quem fez.
 */
@Injectable()
export class ComodatoBaixasService {
  constructor(private readonly prisma: PrismaService) {}

  baixar(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    input: ComodatoBaixaCriar,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const cliente = await this.clienteNaCarteira(
        tx,
        empresaId,
        user,
        clienteId,
      );
      const produto = await tx.produto.findFirst({
        where: { id: input.produtoId, empresaId },
        select: { descricao: true },
      });
      if (!produto) throw new NotFoundException('Produto não encontrado');

      // Baixa o saldo inteiro de agora: é o que está "com o cliente" e não
      // deve mais contar. Remessa que sair depois forma saldo novo.
      const [{ saldo }] = await tx.$queryRaw<{ saldo: number }[]>`
        SELECT ${saldoComodatoSql(Prisma.sql`${input.produtoId}`)}::float8 AS "saldo"
          FROM "clientes" c
         WHERE c."id" = ${clienteId}`;
      if (!(saldo > 0)) {
        throw new BadRequestException(
          'Não há saldo deste equipamento no cliente para baixar.',
        );
      }

      const baixa = await tx.comodatoBaixa.create({
        data: {
          empresaId,
          clienteId,
          produtoId: input.produtoId,
          quantidade: saldo,
          motivo: input.motivo || null,
          createdBy: user.id,
        },
      });
      await this.registrarNoHistorico(tx, empresaId, cliente, user, {
        titulo: `Comodato baixado — ${produto.descricao} (${qtd(saldo)})`,
        descricao:
          `Baixado por ${user.nome}.` +
          (input.motivo ? ` Motivo: ${input.motivo}` : ''),
      });
      return { id: baixa.id, quantidade: saldo };
    });
  }

  desfazer(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    baixaId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const cliente = await this.clienteNaCarteira(
        tx,
        empresaId,
        user,
        clienteId,
      );
      const baixa = await tx.comodatoBaixa.findFirst({
        where: { id: baixaId, empresaId, clienteId, desfeitaEm: null },
        include: { produto: { select: { descricao: true } } },
      });
      if (!baixa) throw new NotFoundException('Baixa não encontrada');

      await tx.comodatoBaixa.update({
        where: { id: baixaId },
        data: { desfeitaEm: new Date(), desfeitaPor: user.id },
      });
      await this.registrarNoHistorico(tx, empresaId, cliente, user, {
        titulo: `Baixa de comodato desfeita — ${baixa.produto.descricao} (${qtd(baixa.quantidade)})`,
        descricao: `Desfeita por ${user.nome}. O saldo volta a contar.`,
      });
      return { ok: true };
    });
  }

  /** Fora da carteira responde 404, como a Posição: não confirma que existe. */
  private async clienteNaCarteira(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
  ) {
    const escopo = await resolverEscopoVendedores(tx, empresaId, user);
    const cliente = await tx.cliente.findFirst({
      where: {
        id: clienteId,
        empresaId,
        deletedAt: null,
        ...(escopo ? { vendedorId: { in: escopo } } : {}),
      },
      select: { id: true, vendedorId: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  /**
   * Atividade já concluída: é registro do que aconteceu, não pendência. Vai
   * para o vendedor do cliente, que é de quem é o histórico; cliente sem
   * vendedor fica sem a linha no histórico (a baixa continua registrada, com
   * autor e data, em comodato_baixas).
   */
  private async registrarNoHistorico(
    tx: TenantTx,
    empresaId: string,
    cliente: { id: string; vendedorId: string | null },
    user: AuthenticatedUser,
    texto: { titulo: string; descricao: string },
  ) {
    if (!cliente.vendedorId) return;
    const agora = new Date();
    await tx.atividade.create({
      data: {
        empresaId,
        clienteId: cliente.id,
        vendedorId: cliente.vendedorId,
        tipo: 'tarefa',
        titulo: texto.titulo,
        descricao: texto.descricao,
        dataVencimento: agora,
        concluida: true,
        dataConclusao: agora,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
  }
}
