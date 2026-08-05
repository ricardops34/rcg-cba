import { randomBytes, createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  IntegracaoApiKeyCreate,
  IntegracaoApiKeyQuery,
  IntegracaoApiKeyUpdate,
} from '@plataforma/contracts';

const SORT_FIELDS = new Set(['nome', 'ativo', 'ultimoUso', 'createdAt']);

// Nunca inclui chaveHash — nem a leitura normal, nem a resposta de criação,
// devem devolver o hash (só o suficiente pra identificar a chave em log/tela).
const SELECT_SEGURO = {
  id: true,
  empresaId: true,
  nome: true,
  prefixo: true,
  ativo: true,
  expiraEm: true,
  ultimoUso: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} as const;

/**
 * `integracao_api_keys` não tem RLS (ver migrations/README.md — o ApiKeyGuard
 * precisa consultá-la antes de existir empresaId de contexto). Isso significa
 * que o filtro `empresaId` abaixo é a ÚNICA barreira de isolamento entre
 * empresas pra esta tabela — nunca removê-lo de nenhuma query aqui.
 */
@Injectable()
export class IntegracaoKeysService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(empresaId: string, query: IntegracaoApiKeyQuery) {
    const where = {
      empresaId,
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.search
        ? { nome: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };
    const sortField =
      query.sortBy && SORT_FIELDS.has(query.sortBy)
        ? query.sortBy
        : 'createdAt';
    return Promise.all([
      this.prisma.integracaoApiKey.findMany({
        where,
        select: SELECT_SEGURO,
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.integracaoApiKey.count({ where }),
    ]).then(([data, total]) => buildPaginatedResult(data, total, query));
  }

  async findOne(empresaId: string, id: string) {
    const chave = await this.prisma.integracaoApiKey.findFirst({
      where: { id, empresaId, deletedAt: null },
      select: SELECT_SEGURO,
    });
    if (!chave)
      throw new NotFoundException('Chave de integração não encontrada');
    return chave;
  }

  async create(
    empresaId: string,
    userId: string,
    input: IntegracaoApiKeyCreate,
  ) {
    // base64url de 30 bytes = 40 chars, sem padding — só [A-Za-z0-9-_].
    const chave = `itg_${randomBytes(30).toString('base64url')}`;
    const chaveHash = createHash('sha256').update(chave).digest('hex');
    const prefixo = chave.slice(0, 12);

    const criada = await this.prisma.integracaoApiKey.create({
      data: {
        empresaId,
        nome: input.nome,
        chaveHash,
        prefixo,
        expiraEm: input.expiraEm ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
      select: SELECT_SEGURO,
    });

    // Única vez em que a chave em claro existe fora da memória do cliente que
    // a gerou — não fica salva em lugar nenhum além do hash.
    return { ...criada, chave };
  }

  async update(
    empresaId: string,
    userId: string,
    id: string,
    input: IntegracaoApiKeyUpdate,
  ) {
    const existente = await this.findOne(empresaId, id);
    return this.prisma.integracaoApiKey.update({
      where: { id: existente.id },
      data: { ...input, updatedBy: userId },
      select: SELECT_SEGURO,
    });
  }

  async remove(empresaId: string, userId: string, id: string) {
    const existente = await this.findOne(empresaId, id);
    return this.prisma.integracaoApiKey.update({
      where: { id: existente.id },
      data: { deletedAt: new Date(), deletedBy: userId, ativo: false },
      select: SELECT_SEGURO,
    });
  }
}
