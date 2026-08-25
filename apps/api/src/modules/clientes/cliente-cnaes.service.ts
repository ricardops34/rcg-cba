import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type { ClienteCnaeCreate } from '@plataforma/contracts';
import { ClienteCampoConfigService } from '../cliente-campo-config/cliente-campo-config.service';
import { CAMPO_CNAES } from './cliente-alteracoes.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

type LinhaComCnae = {
  id: string;
  empresaId: string;
  clienteId: string;
  cnaeId: string;
  principal: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  cnae: { codigoErp: string | null; descricao: string };
};

/**
 * CNAEs do cliente. Coleção filha, então toda operação começa garantindo que o
 * `clienteId` está no escopo de carteira do usuário — um vendedor não lê nem
 * mexe nos filhos de cliente que não alcança (mesma regra e mesmo 404 do
 * cadastro de Cliente).
 */
@Injectable()
export class ClienteCnaesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campoConfig: ClienteCampoConfigService,
  ) {}

  /**
   * Reforço server-side da configuração de campos editáveis, igual ao que
   * `ClientesService.update` faz com as colunas do cadastro: `cnaes` travado na
   * configuração da empresa vale para a API, não só para o formulário — a tela
   * desabilitar o botão não é controle de acesso.
   */
  private async garantirCampoEditavel(empresaId: string) {
    const config = await this.campoConfig.obterConfig(empresaId);
    if (config[CAMPO_CNAES] === false) {
      throw new ForbiddenException(
        'O ramo de atividade (CNAE) está bloqueado para edição nesta empresa.',
      );
    }
  }

  private paraLeitura(linha: LinhaComCnae) {
    const { cnae, ...resto } = linha;
    return { ...resto, codigo: cnae.codigoErp, descricao: cnae.descricao };
  }

  /**
   * 404 (e não 403) quando o cliente está fora do escopo: para quem não
   * alcança a carteira, o cliente simplesmente não existe — não vaza nem a
   * informação de que o id é válido.
   */
  private async garantirClienteNoEscopo(
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
      select: { id: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
  }

  async findAll(empresaId: string, user: AuthenticatedUser, clienteId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.garantirClienteNoEscopo(tx, empresaId, user, clienteId);
      const linhas = await tx.clienteCnae.findMany({
        where: { empresaId, clienteId, deletedAt: null },
        include: { cnae: { select: { codigoErp: true, descricao: true } } },
        // Principal primeiro; o resto por código, para a lista não dançar
        // entre carregamentos.
        orderBy: [{ principal: 'desc' }, { cnae: { codigoErp: 'asc' } }],
      });
      return linhas.map((l) => this.paraLeitura(l));
    });
  }

  async create(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    input: ClienteCnaeCreate,
  ) {
    await this.garantirCampoEditavel(empresaId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.garantirClienteNoEscopo(tx, empresaId, user, clienteId);

      const cnae = await tx.cnae.findFirst({
        where: { id: input.cnaeId, deletedAt: null },
        select: { id: true },
      });
      if (!cnae) throw new NotFoundException('CNAE não encontrado');

      // Soft delete anterior reaproveita a linha: a unique é (clienteId,
      // cnaeId) e não considera deletedAt, então recriar daria erro de chave.
      const existente = await tx.clienteCnae.findUnique({
        where: {
          clienteId_cnaeId: { clienteId, cnaeId: input.cnaeId },
        },
      });
      if (existente && !existente.deletedAt) {
        throw new ConflictException('Este CNAE já está vinculado ao cliente');
      }

      if (input.principal)
        await this.desmarcarPrincipais(tx, empresaId, clienteId);

      const linha = existente
        ? await tx.clienteCnae.update({
            where: { id: existente.id },
            data: {
              principal: input.principal,
              deletedAt: null,
              deletedBy: null,
              updatedBy: user.id,
            },
            include: { cnae: { select: { codigoErp: true, descricao: true } } },
          })
        : await tx.clienteCnae.create({
            data: {
              empresaId,
              clienteId,
              cnaeId: input.cnaeId,
              principal: input.principal,
              createdBy: user.id,
              updatedBy: user.id,
            },
            include: { cnae: { select: { codigoErp: true, descricao: true } } },
          });

      return this.paraLeitura(linha);
    });
  }

  /** Promove um CNAE já vinculado a principal (e rebaixa o anterior). */
  async definirPrincipal(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    id: string,
  ) {
    await this.garantirCampoEditavel(empresaId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.garantirClienteNoEscopo(tx, empresaId, user, clienteId);
      const atual = await tx.clienteCnae.findFirst({
        where: { id, empresaId, clienteId, deletedAt: null },
        select: { id: true },
      });
      if (!atual) throw new NotFoundException('CNAE do cliente não encontrado');

      await this.desmarcarPrincipais(tx, empresaId, clienteId);
      const linha = await tx.clienteCnae.update({
        where: { id },
        data: { principal: true, updatedBy: user.id },
        include: { cnae: { select: { codigoErp: true, descricao: true } } },
      });
      return this.paraLeitura(linha);
    });
  }

  async remove(
    empresaId: string,
    user: AuthenticatedUser,
    clienteId: string,
    id: string,
  ) {
    await this.garantirCampoEditavel(empresaId);
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.garantirClienteNoEscopo(tx, empresaId, user, clienteId);
      const atual = await tx.clienteCnae.findFirst({
        where: { id, empresaId, clienteId, deletedAt: null },
        select: { id: true },
      });
      if (!atual) throw new NotFoundException('CNAE do cliente não encontrado');

      await tx.clienteCnae.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, principal: false },
      });
      return { success: true };
    });
  }

  /** Só um CNAE principal por cliente — o fiscal. */
  private async desmarcarPrincipais(
    tx: TenantTx,
    empresaId: string,
    clienteId: string,
  ) {
    await tx.clienteCnae.updateMany({
      where: { empresaId, clienteId, principal: true, deletedAt: null },
      data: { principal: false },
    });
  }
}
