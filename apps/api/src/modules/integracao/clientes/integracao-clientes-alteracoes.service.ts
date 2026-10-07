import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaginationQuery } from '@plataforma/contracts';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import { CAMPOS_ENVIO_ERP } from '../../clientes/cliente-alteracoes.service';

/** CNAE em 7 dígitos com a máscara do CC3 do Protheus: 4639701 → 4639-7/01. */
const cnaeComMascara = (codigo: string | null | undefined) =>
  codigo && codigo.length === 7
    ? `${codigo.slice(0, 4)}-${codigo[4]}/${codigo.slice(5)}`
    : (codigo ?? null);

/**
 * Retorno ao ERP das alterações de cliente aprovadas na plataforma — o lado
 * da plataforma do `U_BJRETORNO` (`BJPLA004`): o ERP lista os pendentes da
 * fila (`cliente_envios_erp`), grava na SA1 pelo CRMA980 e confirma.
 *
 * Só sai o que foi **aprovado** (à mão ou autoaprovado): a fila só recebe
 * item quando a alteração é aplicada no cadastro — ver
 * `ClienteAlteracoesService.enfileirarEnvioErp`. O valor é o **atual** do
 * cadastro na hora da leitura: duas alterações seguidas do mesmo campo
 * mandam o valor final, nunca um intermediário.
 */
@Injectable()
export class IntegracaoClientesAlteracoesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pendentes, do mais antigo para o mais novo (aplicar na ordem em que foram
   * aprovadas). Cliente sem chave de integração ainda não existe na SA1 — fica
   * na fila até ganhar chave, em vez de o ERP tentar e falhar a cada ciclo.
   */
  listarPendentes(empresaId: string, query: PaginationQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        situacao: 'pendente' as const,
        cliente: { chave: { not: null }, deletedAt: null },
      };
      const [itens, total] = await Promise.all([
        tx.clienteEnvioErp.findMany({
          where,
          orderBy: { criadoEm: 'asc' },
          ...paginationToSkipTake(query),
          include: {
            alteracao: { select: { origem: true, analisadoEm: true } },
            cliente: {
              include: {
                vendedor: { select: { chave: true } },
                tabelaPreco: { select: { chave: true } },
                condicaoPagamento: { select: { chave: true } },
                cnaes: {
                  where: { principal: true, deletedAt: null },
                  select: { cnae: { select: { codigoErp: true } } },
                  take: 1,
                },
              },
            },
          },
        }),
        tx.clienteEnvioErp.count({ where }),
      ]);

      const data = itens.map((item) => {
        const c = item.cliente;
        const valorAtual: Record<string, unknown> = {
          ...c,
          vendedorId: c.vendedor?.chave ?? null,
          tabelaPrecoId: c.tabelaPreco?.chave ?? null,
          condicaoPagamentoId: c.condicaoPagamento?.chave ?? null,
          cnaePrincipal: cnaeComMascara(c.cnaes[0]?.cnae.codigoErp),
          // O ERP lê latitude/longitude como texto (A1_XLAT/A1_XLNG).
          latitude: c.latitude != null ? String(c.latitude) : null,
          longitude: c.longitude != null ? String(c.longitude) : null,
        };
        const campos: Record<string, unknown> = {};
        for (const campo of item.campos) {
          const nome = CAMPOS_ENVIO_ERP[campo];
          if (!nome) continue;
          const valor = valorAtual[campo];
          campos[nome] =
            valor instanceof Date ? valor.toISOString() : (valor ?? null);
        }
        return {
          id: item.id,
          clienteChave: c.chave,
          origem: item.alteracao?.origem ?? null,
          aprovadaEm: (
            item.alteracao?.analisadoEm ?? item.criadoEm
          ).toISOString(),
          ...campos,
        };
      });
      return buildPaginatedResult(data, total, query);
    });
  }

  /**
   * O ERP gravou na SA1: o item sai da fila. 409 — e não 500 — quando já
   * estava enviado, porque o ERP reenvia a confirmação depois de uma queda de
   * rede (ver "Idempotência" no PLANO.md da integração).
   */
  marcarAplicada(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const item = await tx.clienteEnvioErp.findFirst({
        where: { id, empresaId },
        select: { id: true, situacao: true },
      });
      if (!item)
        throw new NotFoundException('Alteração não encontrada na fila');
      if (item.situacao === 'enviado') {
        throw new ConflictException('Alteração já confirmada pelo ERP');
      }
      const atualizado = await tx.clienteEnvioErp.update({
        where: { id },
        data: { situacao: 'enviado', enviadoEm: new Date() },
        select: { id: true, situacao: true, enviadoEm: true },
      });
      return {
        id: atualizado.id,
        situacao: atualizado.situacao,
        enviadoEm: atualizado.enviadoEm?.toISOString() ?? null,
      };
    });
  }
}
