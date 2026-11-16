import { BadRequestException } from '@nestjs/common';
import { OrcamentosService } from './orcamentos.service';
import type { TenantTx } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Regra do vendedor do orçamento (decisão de 2026-11-16): vendedor válido do
 * cliente sempre; o escolhido só se o do cliente for vazio/inválido; no
 * avulso, o vendedor de quem usa o sistema.
 */
type ComRegraDoVendedor = {
  vendedorDoOrcamento: (...args: unknown[]) => Promise<string | null>;
};
const servico = Object.create(
  OrcamentosService.prototype,
) as ComRegraDoVendedor;

// Vendedores válidos: v-cliente, v-meu, v-outro. "v-desligado" não existe
// para a consulta de válidos (filtro ativo/desligado/deletedAt).
function montarTx(opcoes: { meu?: string | null } = {}) {
  const validos = new Set(['v-cliente', 'v-meu', 'v-outro']);
  return {
    vendedor: {
      findFirst: jest.fn(
        ({ where }: { where: { id?: string; usuarioId?: string } }) => {
          if (where.usuarioId) {
            return Promise.resolve(
              opcoes.meu === null ? null : { id: opcoes.meu ?? 'v-meu' },
            );
          }
          return Promise.resolve(
            where.id && validos.has(where.id) ? { id: where.id } : null,
          );
        },
      ),
    },
  } as unknown as TenantTx;
}

const user = { id: 'u1', isAdmin: false } as AuthenticatedUser;

describe('vendedorDoOrcamento', () => {
  it('cliente com vendedor válido: o da carteira, ignorando o escolhido', async () => {
    await expect(
      servico.vendedorDoOrcamento(montarTx(), 'e1', user, null, {
        clienteId: 'c1',
        vendedorDoCliente: 'v-cliente',
        informado: 'v-outro',
      }),
    ).resolves.toBe('v-cliente');
  });

  it('cliente com vendedor desligado: vale o escolhido', async () => {
    await expect(
      servico.vendedorDoOrcamento(montarTx(), 'e1', user, null, {
        clienteId: 'c1',
        vendedorDoCliente: 'v-desligado',
        informado: 'v-outro',
      }),
    ).resolves.toBe('v-outro');
  });

  it('cliente sem vendedor e escolhido inválido: recusa', async () => {
    await expect(
      servico.vendedorDoOrcamento(montarTx(), 'e1', user, null, {
        clienteId: 'c1',
        vendedorDoCliente: null,
        informado: 'v-desligado',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cliente com vendedor inválido e nada escolhido: devolve null', async () => {
    await expect(
      servico.vendedorDoOrcamento(montarTx(), 'e1', user, null, {
        clienteId: 'c1',
        vendedorDoCliente: 'v-desligado',
        informado: undefined,
      }),
    ).resolves.toBeNull();
  });

  it('avulso: o vendedor de quem usa o sistema, ignorando o escolhido', async () => {
    await expect(
      servico.vendedorDoOrcamento(montarTx(), 'e1', user, null, {
        clienteId: null,
        vendedorDoCliente: null,
        informado: 'v-outro',
      }),
    ).resolves.toBe('v-meu');
  });

  it('avulso de quem não tem vendedor: vale o escolhido', async () => {
    await expect(
      servico.vendedorDoOrcamento(montarTx({ meu: null }), 'e1', user, null, {
        clienteId: null,
        vendedorDoCliente: null,
        informado: 'v-outro',
      }),
    ).resolves.toBe('v-outro');
  });
});
