import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ROTA_MAX_PARADAS_GOOGLE,
  type RotaVisitaCalcular,
  type RotaVisitaCalculo,
  type RotaVisitaCreate,
  type RotaVisitaDetalhe,
  type RotaVisitaQuery,
  type RotaVisitaResumo,
} from '@plataforma/contracts';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { GeocodificacaoService } from '../geocodificacao/geocodificacao.service';
import { calcularRotaGoogle } from '../geocodificacao/google-routes';
import { comprimento, ordenarParadas, type Ponto } from './rotas-ordem';

/**
 * Rotas de visita (Gerencial > Mapa e Rotas, 20/11/2026,
 * docs/planos/2026-11-20-mapas-clientes-rotas.md).
 */
@Injectable()
export class RotasVisitaService {
  private readonly logger = new Logger(RotasVisitaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeocodificacaoService,
  ) {}

  /** Clientes da rota, com coordenada, dentro do escopo de carteira. */
  private async clientesDaRota(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    ids: string[],
  ) {
    const escopo = await resolverEscopoVendedores(tx, empresaId, user);
    const clientes = await tx.cliente.findMany({
      where: {
        id: { in: ids },
        empresaId,
        deletedAt: null,
        ...(escopo ? { vendedorId: { in: escopo } } : {}),
      },
      select: {
        id: true,
        razaoSocial: true,
        latitude: true,
        longitude: true,
      },
    });
    const porId = new Map(clientes.map((c) => [c.id, c]));
    const faltando = ids.filter((id) => !porId.has(id));
    if (faltando.length) {
      throw new BadRequestException(
        `${faltando.length} cliente(s) não encontrado(s) ou fora da sua carteira`,
      );
    }
    const semPonto = clientes.filter(
      (c) =>
        c.latitude == null ||
        c.longitude == null ||
        (c.latitude === 0 && c.longitude === 0),
    );
    if (semPonto.length) {
      throw new BadRequestException(
        `Sem coordenada: ${semPonto.map((c) => c.razaoSocial).join(', ')}`,
      );
    }
    return ids.map((id) => porId.get(id)!);
  }

  async calcular(
    empresaId: string,
    user: AuthenticatedUser,
    input: RotaVisitaCalcular,
  ): Promise<RotaVisitaCalculo> {
    const clientes = await this.prisma.withTenant(empresaId, (tx) =>
      this.clientesDaRota(tx, empresaId, user, input.clienteIds),
    );
    const pontos: Ponto[] = clientes.map((c) => ({
      latitude: c.latitude!,
      longitude: c.longitude!,
    }));
    const ordem = ordenarParadas(input.origem, pontos, input.retornar);
    const linhaReta = (aviso: string | null): RotaVisitaCalculo => ({
      calculadaPor: 'linha_reta',
      clienteIds: ordem.map((i) => clientes[i].id),
      distanciaMetros: Math.round(
        comprimento(
          input.origem,
          ordem.map((i) => pontos[i]),
          input.retornar,
        ),
      ),
      duracaoSegundos: null,
      polilinha: null,
      aviso,
    });

    const cfg = await this.geo.config(empresaId);
    if (!cfg.rotasGoogle || !cfg.chave) {
      return linhaReta(null);
    }
    if (clientes.length > ROTA_MAX_PARADAS_GOOGLE + (input.retornar ? 0 : 1)) {
      return linhaReta(
        `O Google otimiza até ${ROTA_MAX_PARADAS_GOOGLE} paradas por rota; esta foi ordenada por proximidade.`,
      );
    }

    // Sem retorno, o destino é a última parada da ordem por proximidade; o
    // Google reordena as do meio.
    const destinoIdx = input.retornar ? null : ordem[ordem.length - 1];
    const meio = input.retornar ? ordem : ordem.slice(0, -1);
    const r = await calcularRotaGoogle(
      cfg.chave,
      input.origem,
      destinoIdx === null ? input.origem : pontos[destinoIdx],
      meio.map((i) => pontos[i]),
      true,
    );
    if (!r.ok) {
      this.logger.warn(
        `Routes API recusou (empresa ${empresaId}): ${r.motivo}`,
      );
      return linhaReta(
        `Google não calculou (${r.motivo}); a rota foi ordenada por proximidade.`,
      );
    }
    const otimizada = r.ordemIntermediarios
      ? r.ordemIntermediarios.map((k) => meio[k])
      : meio;
    const final = destinoIdx === null ? otimizada : [...otimizada, destinoIdx];
    return {
      calculadaPor: 'google',
      clienteIds: final.map((i) => clientes[i].id),
      distanciaMetros: r.distanciaMetros,
      duracaoSegundos: r.duracaoSegundos,
      polilinha: r.polilinha,
      aviso: null,
    };
  }

  async criar(
    empresaId: string,
    user: AuthenticatedUser,
    input: RotaVisitaCreate,
  ): Promise<RotaVisitaDetalhe> {
    const id = await this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await resolverEscopoVendedores(tx, empresaId, user);
      if (escopo && !escopo.includes(input.vendedorId)) {
        throw new ForbiddenException('Vendedor fora da sua equipe');
      }
      const vendedor = await tx.vendedor.findFirst({
        where: { id: input.vendedorId, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!vendedor) throw new BadRequestException('Vendedor não encontrado');
      const clientes = await this.clientesDaRota(
        tx,
        empresaId,
        user,
        input.clienteIds,
      );

      const rota = await tx.rotaVisita.create({
        data: {
          empresaId,
          vendedorId: input.vendedorId,
          data: new Date(`${input.data}T00:00:00Z`),
          nome: input.nome,
          origemLatitude: input.origem.latitude,
          origemLongitude: input.origem.longitude,
          retornar: input.retornar,
          calculadaPor: input.calculadaPor,
          distanciaMetros: input.distanciaMetros,
          duracaoSegundos: input.duracaoSegundos,
          polilinha: input.polilinha,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      // Meio-dia UTC: cai no mesmo dia em qualquer fuso do Brasil.
      const quando = new Date(`${input.data}T12:00:00Z`);
      for (const [i, c] of clientes.entries()) {
        const atividade = await tx.atividade.create({
          data: {
            empresaId,
            clienteId: c.id,
            vendedorId: input.vendedorId,
            tipo: 'visita',
            titulo: `Visita ${i + 1}/${clientes.length} — ${c.razaoSocial}`,
            descricao: `Rota: ${input.nome}`,
            dataVencimento: quando,
            concluida: false,
            createdBy: user.id,
            updatedBy: user.id,
          },
          select: { id: true },
        });
        await tx.rotaVisitaParada.create({
          data: {
            empresaId,
            rotaId: rota.id,
            clienteId: c.id,
            ordem: i + 1,
            atividadeId: atividade.id,
          },
        });
      }
      return rota.id;
    });
    return this.detalhe(empresaId, user, id);
  }

  private async escopoOuTudo(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
  ) {
    return resolverEscopoVendedores(tx, empresaId, user);
  }

  listar(
    empresaId: string,
    user: AuthenticatedUser,
    q: RotaVisitaQuery,
  ): Promise<RotaVisitaResumo[]> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.escopoOuTudo(tx, empresaId, user);
      const rotas = await tx.rotaVisita.findMany({
        where: {
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
          ...(q.vendedorId ? { vendedorId: q.vendedorId } : {}),
          ...(q.de || q.ate
            ? {
                data: {
                  ...(q.de ? { gte: new Date(`${q.de}T00:00:00Z`) } : {}),
                  ...(q.ate ? { lte: new Date(`${q.ate}T00:00:00Z`) } : {}),
                },
              }
            : {}),
        },
        include: {
          vendedor: { select: { nome: true } },
          paradas: { select: { atividadeId: true } },
        },
        orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      });
      const atividadeIds = rotas.flatMap((r) =>
        r.paradas.map((p) => p.atividadeId).filter((v): v is string => !!v),
      );
      const feitas = new Set(
        (
          await tx.atividade.findMany({
            where: { id: { in: atividadeIds }, concluida: true },
            select: { id: true },
          })
        ).map((a) => a.id),
      );
      return rotas.map((r) => ({
        id: r.id,
        nome: r.nome,
        data: r.data.toISOString().slice(0, 10),
        vendedorId: r.vendedorId,
        vendedorNome: r.vendedor.nome,
        calculadaPor: r.calculadaPor === 'google' ? 'google' : 'linha_reta',
        distanciaMetros: r.distanciaMetros,
        duracaoSegundos: r.duracaoSegundos,
        total: r.paradas.length,
        feitas: r.paradas.filter(
          (p) => p.atividadeId && feitas.has(p.atividadeId),
        ).length,
      }));
    });
  }

  detalhe(
    empresaId: string,
    user: AuthenticatedUser,
    id: string,
  ): Promise<RotaVisitaDetalhe> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.escopoOuTudo(tx, empresaId, user);
      const r = await tx.rotaVisita.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: {
          vendedor: { select: { nome: true } },
          paradas: {
            orderBy: { ordem: 'asc' },
            include: {
              cliente: {
                select: {
                  codigoErp: true,
                  razaoSocial: true,
                  endereco: true,
                  municipio: true,
                  uf: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
        },
      });
      if (!r) throw new NotFoundException('Rota não encontrada');
      const atividadeIds = r.paradas
        .map((p) => p.atividadeId)
        .filter((v): v is string => !!v);
      const feitas = new Set(
        (
          await tx.atividade.findMany({
            where: { id: { in: atividadeIds }, concluida: true },
            select: { id: true },
          })
        ).map((a) => a.id),
      );
      const paradas = r.paradas.map((p) => ({
        ordem: p.ordem,
        clienteId: p.clienteId,
        codigoErp: p.cliente.codigoErp,
        razaoSocial: p.cliente.razaoSocial,
        endereco: p.cliente.endereco,
        municipio: p.cliente.municipio,
        uf: p.cliente.uf,
        latitude: p.cliente.latitude,
        longitude: p.cliente.longitude,
        atividadeId: p.atividadeId,
        feita: !!p.atividadeId && feitas.has(p.atividadeId),
      }));
      return {
        id: r.id,
        nome: r.nome,
        data: r.data.toISOString().slice(0, 10),
        vendedorId: r.vendedorId,
        vendedorNome: r.vendedor.nome,
        calculadaPor: r.calculadaPor === 'google' ? 'google' : 'linha_reta',
        distanciaMetros: r.distanciaMetros,
        duracaoSegundos: r.duracaoSegundos,
        total: paradas.length,
        feitas: paradas.filter((p) => p.feita).length,
        origemLatitude: r.origemLatitude,
        origemLongitude: r.origemLongitude,
        retornar: r.retornar,
        polilinha: r.polilinha,
        paradas,
      };
    });
  }

  /**
   * Exclui a rota e as visitas dela que ainda não foram feitas. As feitas
   * ficam na Agenda: são o registro do que aconteceu.
   */
  remover(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const escopo = await this.escopoOuTudo(tx, empresaId, user);
      const r = await tx.rotaVisita.findFirst({
        where: {
          id,
          empresaId,
          deletedAt: null,
          ...(escopo ? { vendedorId: { in: escopo } } : {}),
        },
        include: { paradas: { select: { atividadeId: true } } },
      });
      if (!r) throw new NotFoundException('Rota não encontrada');
      const agora = new Date();
      await tx.atividade.updateMany({
        where: {
          id: {
            in: r.paradas
              .map((p) => p.atividadeId)
              .filter((v): v is string => !!v),
          },
          concluida: false,
        },
        data: { deletedAt: agora, deletedBy: user.id },
      });
      await tx.rotaVisita.update({
        where: { id },
        data: { deletedAt: agora, deletedBy: user.id },
      });
      return { removida: true };
    });
  }
}
