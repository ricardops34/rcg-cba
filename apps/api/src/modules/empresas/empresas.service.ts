import { existsSync, unlink } from 'node:fs';
import { basename, join } from 'node:path';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPaginatedResult, paginationToSkipTake } from '../../common/pagination/paginate';
import {
  BANNERS_DIR,
  bannerPublicPath,
  LOGOS_DIR,
  logoPublicPath,
} from '../../common/uploads/uploads.config';
import type { EmpresaCreate, EmpresaQuery, EmpresaUpdate } from '@plataforma/contracts';

const SORT_FIELDS = new Set([
  'razaoSocial',
  'nomeFantasia',
  'cnpj',
  'situacao',
  'createdAt',
]);

/**
 * Campos que só a administração da plataforma governa. Um administrador de
 * empresa que os alcançasse se liberaria sozinho — estenderia o próprio teste,
 * sairia de suspenso, apagaria o teto de usuários. Por isso a lista é
 * removida do payload antes do `update`, em vez de apenas escondida da tela.
 */
const CAMPOS_DA_PLATAFORMA = [
  'situacao',
  'testeExpiraEm',
  'limiteUsuarios',
] as const;

/** Quem está executando a ação: id, empresa da sessão e se administra a plataforma. */
export type AtorEmpresa = {
  id: string;
  empresaAtivaId?: string;
  administradorPlataforma?: boolean;
};

@Injectable()
export class EmpresasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recusa quem tenta alcançar empresa que não é a sua.
   *
   * O administrador da plataforma passa por qualquer uma; o administrador de
   * empresa, só pela empresa ativa da sessão dele. Antes disto, a permissão
   * `empresas.editar` — que o perfil Administrador tem — valia para **todas**
   * as empresas da base, porque o service nunca comparou o id recebido com o
   * da sessão.
   */
  private garantirEscopo(
    user: { empresaAtivaId?: string; administradorPlataforma?: boolean },
    empresaId: string,
  ) {
    if (user.administradorPlataforma) return;
    if (user.empresaAtivaId !== empresaId) {
      throw new ForbiddenException('Esta empresa não é a da sua sessão');
    }
  }

  /** Tira do payload o que só a plataforma pode mudar. */
  private semCamposDaPlataforma<T extends Record<string, unknown>>(
    input: T,
    administradorPlataforma: boolean,
  ) {
    if (administradorPlataforma) return input;
    const out = { ...input };
    for (const campo of CAMPOS_DA_PLATAFORMA) delete out[campo];
    return out;
  }

  /** Campo vazio do formulário vira null no banco (mesmo padrão dos demais cadastros). */
  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  async findAll(query: EmpresaQuery) {
    const where = {
      deletedAt: null,
      ...(query.situacao !== undefined ? { situacao: query.situacao } : {}),
      ...(query.search
        ? {
            OR: [
              { razaoSocial: { contains: query.search, mode: 'insensitive' as const } },
              { nomeFantasia: { contains: query.search, mode: 'insensitive' as const } },
              { cnpj: { contains: query.search } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'razaoSocial';

    const [data, total] = await Promise.all([
      this.prisma.empresa.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.empresa.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id, deletedAt: null },
    });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');
    return empresa;
  }

  /**
   * Detalhe de uma empresa, conferindo antes que ela seja alcançável por quem
   * pediu. É o que a rota `GET /empresas/:id` usa — a versão sem conferência
   * fica para uso interno, onde o id já veio da própria sessão.
   */
  async findOneDoAtor(id: string, user: AtorEmpresa) {
    this.garantirEscopo(user, id);
    return this.findOne(id);
  }

  async create(input: EmpresaCreate, userId: string) {
    const existente = await this.prisma.empresa.findUnique({
      where: { cnpj: input.cnpj },
    });
    if (existente) throw new ConflictException('CNPJ já cadastrado');

    if (input.alias) await this.ensureAliasDisponivel(input.alias);

    return this.prisma.empresa.create({
      data: {
        ...(this.limpar(input) as object),
        createdBy: userId,
        updatedBy: userId,
      } as never,
    });
  }

  async update(id: string, input: EmpresaUpdate, user: AtorEmpresa) {
    this.garantirEscopo(user, id);
    await this.findOne(id);
    if (input.alias) await this.ensureAliasDisponivel(input.alias, id);
    const dados = this.semCamposDaPlataforma(
      this.limpar(input),
      user.administradorPlataforma === true,
    );
    return this.prisma.empresa.update({
      where: { id },
      data: { ...(dados as object), updatedBy: user.id } as never,
    });
  }

  /** Garante que o alias não está em uso por outra empresa. */
  private async ensureAliasDisponivel(alias: string, ignorarId?: string) {
    const emUso = await this.prisma.empresa.findFirst({
      where: {
        alias,
        deletedAt: null,
        ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
      },
      select: { id: true },
    });
    if (emUso) throw new ConflictException('Alias já em uso por outra empresa');
  }

  /** Define o logo da empresa a partir do arquivo já gravado em disco. */
  async setLogo(id: string, filename: string, user: AtorEmpresa) {
    this.garantirEscopo(user, id);
    const empresa = await this.findOne(id);

    // Remove o logo anterior (best-effort) para não acumular órfãos em disco.
    if (empresa.logoUrl) {
      const anterior = join(LOGOS_DIR, basename(empresa.logoUrl));
      if (existsSync(anterior)) unlink(anterior, () => undefined);
    }

    return this.prisma.empresa.update({
      where: { id },
      data: { logoUrl: logoPublicPath(filename), updatedBy: user.id },
    });
  }

  /**
   * Define a imagem da faixa institucional a partir do arquivo já gravado.
   *
   * Não liga a faixa sozinha: enviar a imagem e decidir exibir são ações
   * diferentes, e o admin costuma subir a arte antes de publicar.
   */
  async setBanner(id: string, filename: string, user: AtorEmpresa) {
    this.garantirEscopo(user, id);
    const empresa = await this.findOne(id);

    if (empresa.bannerImagemUrl) {
      const anterior = join(BANNERS_DIR, basename(empresa.bannerImagemUrl));
      if (existsSync(anterior)) unlink(anterior, () => undefined);
    }

    return this.prisma.empresa.update({
      where: { id },
      data: { bannerImagemUrl: bannerPublicPath(filename), updatedBy: user.id },
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.empresa.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId, situacao: 'cancelada' },
    });
    return { success: true };
  }
}
