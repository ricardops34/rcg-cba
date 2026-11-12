import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../../common/pagination/paginate';
import {
  BASE_URLS,
  ExternalHttpService,
} from '../../../common/external-http/external-http.service';
import type {
  CepCreate,
  CepQuery,
  CepUpdate,
  ConsultaCepResultado,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { criarOuReativar, gravarUnico, REATIVAR } from '../unicidade';

/** Resposta do ViaCEP — só o que consumimos. */
interface ViaCepResposta {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  ibge?: string;
  erro?: boolean | string;
}

const SORT_FIELDS = new Set(['cep', 'endereco', 'bairro', 'ativo', 'createdAt']);

/**
 * Depois deste tempo o CEP que veio do ViaCEP é consultado de novo (logradouro e
 * bairro mudam). Se o ViaCEP estiver fora, vale o cache. CEP digitado à mão não vence.
 */
const VALIDADE_CACHE_VIACEP_MS = 180 * 24 * 60 * 60 * 1000;

const ESTADO_SELECT = { select: { id: true, sigla: true } };
const MUNICIPIO_SELECT = { select: { id: true, descricao: true } };

// Tabela de referência global (sem empresaId/RLS, como Modulo/Menu).
@Injectable()
export class CepsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: ExternalHttpService,
  ) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  async findAll(query: CepQuery) {
    const where = {
      deletedAt: null,
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.estadoId ? { estadoId: query.estadoId } : {}),
      ...(query.municipioId ? { municipioId: query.municipioId } : {}),
      ...(query.search
        ? {
            OR: [
              { cep: { contains: query.search, mode: 'insensitive' as const } },
              { endereco: { contains: query.search, mode: 'insensitive' as const } },
              { bairro: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'cep';
    const [data, total] = await Promise.all([
      this.prisma.cep.findMany({
        where,
        include: { estado: ESTADO_SELECT, municipio: MUNICIPIO_SELECT },
        ...paginationToSkipTake(query),
        orderBy: { [sortField]: query.sortOrder },
      }),
      this.prisma.cep.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query);
  }

  async findOne(id: string) {
    const cep = await this.prisma.cep.findFirst({
      where: { id, deletedAt: null },
      include: { estado: ESTADO_SELECT, municipio: MUNICIPIO_SELECT },
    });
    if (!cep) throw new NotFoundException('CEP não encontrado');
    return cep;
  }

  async create(user: AuthenticatedUser, input: CepCreate) {
    const dados = this.limpar(input);
    const chave = dados.cep ? { cep: dados.cep as string } : null;
    return criarOuReativar({
      achaExcluido: () =>
        chave
          ? this.prisma.cep.findFirst({
              where: { deletedAt: { not: null }, ...chave },
              select: { id: true },
            })
          : Promise.resolve(null),
      reativar: (id) =>
        this.prisma.cep.update({
          where: { id },
          data: { ...(dados as object), ...REATIVAR, updatedBy: user.id } as never,
        }),
      criar: () =>
        this.prisma.cep.create({
          data: { ...(dados as object), createdBy: user.id, updatedBy: user.id } as never,
        }),
      jaExiste: 'Já existe um cadastro para este CEP',
    });
  }

  async update(user: AuthenticatedUser, id: string, input: CepUpdate) {
    const cep = await this.prisma.cep.findFirst({ where: { id, deletedAt: null } });
    if (!cep) throw new NotFoundException('CEP não encontrado');
    return gravarUnico(
      () =>
        this.prisma.cep.update({
          where: { id },
          data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
        }),
      'Já existe um cadastro para este CEP',
    );
  }

  async remove(user: AuthenticatedUser, id: string) {
    const cep = await this.prisma.cep.findFirst({ where: { id, deletedAt: null } });
    if (!cep) throw new NotFoundException('CEP não encontrado');
    return this.prisma.cep.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
    });
  }

  /**
   * Resolve o endereço de um CEP, cache-first: a tabela `ceps` é o cache, e o
   * ViaCEP só é chamado no miss. Como o cadastro de clientes repete muito os
   * mesmos CEPs, a maioria das consultas nem sai da nossa rede.
   */
  async consultar(cepBruto: string): Promise<ConsultaCepResultado> {
    const cep = String(cepBruto ?? '').replace(/\D/g, '');
    if (cep.length !== 8) {
      throw new BadRequestException('CEP deve ter 8 dígitos');
    }

    const cacheado = await this.prisma.cep.findFirst({
      where: { cep, deletedAt: null },
      include: { estado: ESTADO_SELECT, municipio: MUNICIPIO_SELECT },
    });
    const doCache = (): ConsultaCepResultado | null =>
      cacheado
        ? {
            cep,
            endereco: cacheado.endereco,
            bairro: cacheado.bairro,
            municipio: cacheado.municipio?.descricao ?? null,
            municipioId: cacheado.municipioId,
            uf: cacheado.estado?.sigla ?? null,
            estadoId: cacheado.estadoId,
            origem: 'cache',
          }
        : null;

    const vencido =
      !!cacheado &&
      cacheado.origem === 'viacep' &&
      Date.now() - cacheado.updatedAt.getTime() > VALIDADE_CACHE_VIACEP_MS;
    if (cacheado && !vencido) return doCache()!;

    let dados: ViaCepResposta;
    try {
      dados = await this.http.getJson<ViaCepResposta>(
        `${BASE_URLS.viacep()}/ws/${cep}/json/`,
        {
          fonte: 'ViaCEP',
          // O ViaCEP responde 200 com { erro: true } para CEP inexistente.
          naoEncontrado: (_status, corpo) =>
            (corpo as ViaCepResposta)?.erro === true ||
            (corpo as ViaCepResposta)?.erro === 'true',
          mensagemNaoEncontrado: 'CEP não encontrado',
        },
      );
    } catch (err) {
      // Revalidação que falhou não derruba a consulta: o cache vencido ainda serve.
      if (cacheado) return doCache()!;
      throw err;
    }

    const uf = dados.uf?.trim().toUpperCase() || null;
    const estado = uf
      ? await this.prisma.estado.findFirst({
          where: { sigla: uf, deletedAt: null },
          select: { id: true, sigla: true },
        })
      : null;

    const codigoIbge = String(dados.ibge ?? '').replace(/\D/g, '');
    const municipio = codigoIbge
      ? await this.prisma.municipio.findFirst({
          where: { codigoIbge, deletedAt: null },
          select: { id: true, descricao: true },
        })
      : null;

    const endereco = dados.logradouro?.trim() || null;
    const bairro = dados.bairro?.trim() || null;

    // Persiste para a próxima consulta sair do cache. Se o CEP já existir
    // (corrida entre duas telas), o upsert só atualiza.
    await this.prisma.cep.upsert({
      where: { cep },
      create: {
        cep,
        endereco,
        bairro,
        estadoId: estado?.id ?? null,
        municipioId: municipio?.id ?? null,
        origem: 'viacep',
      },
      // Também traz de volta o CEP que tinha sido excluído: sem isso a linha
      // seguia "excluída" e toda consulta voltava a chamar o ViaCEP.
      update: {
        endereco,
        bairro,
        estadoId: estado?.id ?? null,
        municipioId: municipio?.id ?? null,
        origem: 'viacep',
        ...REATIVAR,
      },
    });

    return {
      cep,
      endereco,
      bairro,
      municipio: municipio?.descricao ?? dados.localidade?.trim() ?? null,
      municipioId: municipio?.id ?? null,
      uf,
      estadoId: estado?.id ?? null,
      origem: 'viacep',
    };
  }
}
