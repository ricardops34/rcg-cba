import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  GeometriaRegiao,
  VendedorRegiao,
  VendedorRegiaoCreate,
  VendedorRegiaoInvasao,
  VendedorRegiaoMunicipioOpcao,
  VendedorRegiaoMunicipioQuery,
  VendedorRegiaoResumoVendedor,
  VendedorRegiaoUpdate,
  VendedorRegioesInvasoes,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import {
  avaliarInvasao,
  fecharAneis,
  normalizarNome,
  type RegiaoParaAvaliar,
} from './regioes-geo';

/** Divisa do município no serviço público de malhas do IBGE. */
const IBGE_MALHA = (codigoIbge: string) =>
  `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codigoIbge}?formato=application/vnd.geo+json&qualidade=intermediaria`;

const SELECT_REGIAO = {
  id: true,
  nome: true,
  vendedorId: true,
  tipo: true,
  municipioId: true,
  geometria: true,
  vendedor: { select: { nome: true } },
  municipio: {
    select: { descricao: true, estado: { select: { sigla: true } } },
  },
} as const;

type RegiaoLida = Prisma.VendedorRegiaoGetPayload<{
  select: typeof SELECT_REGIAO;
}>;

function paraRegiao(r: RegiaoLida): VendedorRegiao {
  return {
    id: r.id,
    nome: r.nome,
    vendedorId: r.vendedorId,
    vendedorNome: r.vendedor?.nome ?? null,
    tipo: r.tipo === 'municipio' ? 'municipio' : 'area',
    municipioId: r.municipioId,
    municipioNome: r.municipio?.descricao ?? null,
    uf: r.municipio?.estado?.sigla ?? null,
    geometria: (r.geometria as GeometriaRegiao | null) ?? null,
  };
}

/** A geometria do GeoJSON do IBGE (Feature ou FeatureCollection), se for polígono. */
function geometriaDoIbge(corpo: unknown): GeometriaRegiao | null {
  const c = corpo as {
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    features?: Array<{ geometry?: { type?: string; coordinates?: unknown } }>;
  };
  const g =
    c?.type === 'FeatureCollection' ? c.features?.[0]?.geometry : c?.geometry;
  if (
    (g?.type === 'Polygon' || g?.type === 'MultiPolygon') &&
    Array.isArray(g.coordinates)
  ) {
    return g as GeometriaRegiao;
  }
  return null;
}

/**
 * Regiões de atuação dos vendedores e a apuração de invasão (20/11/2026,
 * docs/planos/2026-11-20-mapas-clientes-rotas.md). Invasão: cliente da
 * carteira de um vendedor dentro da região de outro — ver `avaliarInvasao`.
 */
@Injectable()
export class VendedorRegioesService {
  private readonly logger = new Logger(VendedorRegioesService.name);

  constructor(private readonly prisma: PrismaService) {}

  listar(empresaId: string): Promise<VendedorRegiao[]> {
    return this.prisma.withTenant(empresaId, async (tx) =>
      (
        await tx.vendedorRegiao.findMany({
          where: { empresaId, deletedAt: null, ativo: true },
          select: SELECT_REGIAO,
          orderBy: { nome: 'asc' },
        })
      ).map(paraRegiao),
    );
  }

  /** Municípios para escolher (tabela global de referência). */
  async municipios(
    q: VendedorRegiaoMunicipioQuery,
  ): Promise<VendedorRegiaoMunicipioOpcao[]> {
    const linhas = await this.prisma.municipio.findMany({
      where: {
        deletedAt: null,
        ativo: true,
        ...(q.uf ? { estado: { sigla: q.uf.toUpperCase() } } : {}),
        ...(q.busca
          ? { descricao: { contains: q.busca, mode: 'insensitive' } }
          : {}),
      },
      select: {
        id: true,
        descricao: true,
        estado: { select: { sigla: true } },
      },
      orderBy: { descricao: 'asc' },
      take: 50,
    });
    return linhas.map((m) => ({
      id: m.id,
      nome: m.descricao,
      uf: m.estado?.sigla ?? '',
    }));
  }

  private async conferirVendedor(
    tx: Prisma.TransactionClient,
    empresaId: string,
    vendedorId: string | null | undefined,
  ) {
    if (!vendedorId) return;
    const v = await tx.vendedor.findFirst({
      where: { id: vendedorId, empresaId, deletedAt: null },
      select: { id: true },
    });
    if (!v) throw new BadRequestException('Vendedor não encontrado');
  }

  /** A divisa do município no IBGE; sem ela, a região vale pelo nome. */
  private async divisaDoMunicipio(
    codigoIbge: string | null,
  ): Promise<GeometriaRegiao | null> {
    if (!codigoIbge) return null;
    try {
      const r = await fetch(IBGE_MALHA(codigoIbge), {
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return geometriaDoIbge(await r.json());
    } catch (erro) {
      this.logger.warn(
        `Divisa do município ${codigoIbge} não obtida do IBGE: ${(erro as Error).message}`,
      );
      return null;
    }
  }

  async criar(
    empresaId: string,
    user: AuthenticatedUser,
    input: VendedorRegiaoCreate,
  ): Promise<VendedorRegiao> {
    let geometria: GeometriaRegiao | null = null;
    if (input.tipo === 'municipio') {
      const m = await this.prisma.municipio.findFirst({
        where: { id: input.municipioId!, deletedAt: null },
        select: { codigoIbge: true },
      });
      if (!m) throw new BadRequestException('Município não encontrado');
      // Fora da transação: é chamada HTTP.
      geometria = await this.divisaDoMunicipio(m.codigoIbge);
    } else {
      geometria = fecharAneis(input.geometria!);
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conferirVendedor(tx, empresaId, input.vendedorId);
      const criada = await tx.vendedorRegiao.create({
        data: {
          empresaId,
          nome: input.nome,
          vendedorId: input.vendedorId,
          tipo: input.tipo,
          municipioId: input.tipo === 'municipio' ? input.municipioId : null,
          geometria: (geometria ?? undefined) as Prisma.InputJsonValue,
          createdBy: user.id,
          updatedBy: user.id,
        },
        select: SELECT_REGIAO,
      });
      return paraRegiao(criada);
    });
  }

  atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
    input: VendedorRegiaoUpdate,
  ): Promise<VendedorRegiao> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const atual = await tx.vendedorRegiao.findFirst({
        where: { id, empresaId, deletedAt: null },
        select: { tipo: true },
      });
      if (!atual) throw new NotFoundException('Região não encontrada');
      if (input.geometria && atual.tipo !== 'area') {
        throw new BadRequestException(
          'A divisa do município vem do IBGE e não é editada',
        );
      }
      await this.conferirVendedor(tx, empresaId, input.vendedorId);
      const r = await tx.vendedorRegiao.update({
        where: { id },
        data: {
          ...(input.nome !== undefined ? { nome: input.nome } : {}),
          ...(input.vendedorId !== undefined
            ? { vendedorId: input.vendedorId }
            : {}),
          ...(input.geometria
            ? {
                geometria: fecharAneis(input.geometria),
              }
            : {}),
          updatedBy: user.id,
        },
        select: SELECT_REGIAO,
      });
      return paraRegiao(r);
    });
  }

  remover(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const r = await tx.vendedorRegiao.updateMany({
        where: { id, empresaId, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: user.id },
      });
      if (!r.count) throw new NotFoundException('Região não encontrada');
      return { removida: true };
    });
  }

  /**
   * Clientes ativos da carteira de um vendedor que estão na região de outro.
   * Quem tem escopo de carteira (supervisor) vê as invasões que envolvem a
   * equipe dele — de um lado ou do outro.
   */
  invasoes(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<VendedorRegioesInvasoes> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      const regioesLidas = await tx.vendedorRegiao.findMany({
        where: { empresaId, deletedAt: null, ativo: true },
        select: SELECT_REGIAO,
      });
      const regioes: RegiaoParaAvaliar[] = regioesLidas.map((r) => ({
        id: r.id,
        nome: r.nome,
        vendedorId: r.vendedorId,
        vendedorNome: r.vendedor?.nome ?? null,
        tipo: r.tipo === 'municipio' ? 'municipio' : 'area',
        municipioChave: r.municipio
          ? `${normalizarNome(r.municipio.descricao)}|${r.municipio.estado?.sigla ?? ''}`
          : null,
        geometria: (r.geometria as GeometriaRegiao | null) ?? null,
      }));
      if (!regioes.some((r) => r.vendedorId)) {
        return { invasoes: [], porVendedor: [], avaliados: 0 };
      }

      const clientes = await tx.cliente.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ativo: true,
          vendedorId: { not: null },
        },
        select: {
          id: true,
          codigoErp: true,
          razaoSocial: true,
          municipio: true,
          uf: true,
          latitude: true,
          longitude: true,
          vendedorId: true,
          vendedor: { select: { nome: true } },
        },
      });

      const noEscopo = (vendedorId: string | null) =>
        escopo === null || (!!vendedorId && escopo.includes(vendedorId));
      const invasoes: VendedorRegiaoInvasao[] = [];
      const resumo = new Map<string, VendedorRegiaoResumoVendedor>();
      const doResumo = (id: string, nome: string) => {
        let r = resumo.get(id);
        if (!r) {
          r = { vendedorId: id, vendedorNome: nome, invadindo: 0, invadido: 0 };
          resumo.set(id, r);
        }
        return r;
      };

      for (const c of clientes) {
        const resultado = avaliarInvasao(
          { ...c, vendedorId: c.vendedorId! },
          regioes,
        );
        if (!resultado) continue;
        const envolvidos = [
          c.vendedorId,
          ...resultado.invasoras.map((r) => r.vendedorId),
        ];
        if (!envolvidos.some(noEscopo)) continue;
        invasoes.push({
          clienteId: c.id,
          codigoErp: c.codigoErp,
          razaoSocial: c.razaoSocial,
          municipio: c.municipio,
          uf: c.uf,
          latitude: c.latitude,
          longitude: c.longitude,
          vendedorId: c.vendedorId!,
          vendedorNome: c.vendedor?.nome ?? '—',
          regioes: resultado.invasoras.map((r) => ({
            id: r.id,
            nome: r.nome,
            vendedorId: r.vendedorId!,
            vendedorNome: r.vendedorNome ?? '—',
          })),
          porMunicipio: resultado.porMunicipio,
        });
        doResumo(c.vendedorId!, c.vendedor?.nome ?? '—').invadindo++;
        for (const dono of new Map(
          resultado.invasoras.map((r) => [
            r.vendedorId!,
            r.vendedorNome ?? '—',
          ]),
        )) {
          doResumo(dono[0], dono[1]).invadido++;
        }
      }

      invasoes.sort(
        (a, b) =>
          a.vendedorNome.localeCompare(b.vendedorNome) ||
          a.razaoSocial.localeCompare(b.razaoSocial),
      );
      return {
        invasoes,
        porVendedor: [...resumo.values()]
          .filter((r) => noEscopo(r.vendedorId))
          .sort(
            (a, b) => b.invadindo + b.invadido - (a.invadindo + a.invadido),
          ),
        avaliados: clientes.length,
      };
    });
  }
}
