import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type {
  GeocodificacaoLoteBody,
  GeocodificacaoLoteSituacao,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ClienteAlteracoesService } from '../clientes/cliente-alteracoes.service';
import {
  GeocodificacaoService,
  textoDoEndereco,
} from './geocodificacao.service';

/** Folga entre consultas: o Google aceita 50 por segundo, aqui ~10. */
const INTERVALO_MS = 100;
/** Falhas seguidas que encerram o lote: o serviço está fora. */
const MAX_FALHAS_SEGUIDAS = 10;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SITUACAO_VAZIA: GeocodificacaoLoteSituacao = {
  rodando: false,
  iniciadoEm: null,
  concluidoEm: null,
  total: 0,
  processados: 0,
  encontrados: 0,
  naoEncontrados: 0,
  erros: 0,
  erro: null,
};

/**
 * Onde o lote procura: cliente ativo, sem coordenada e com rua, município e
 * UF. Sem `incluirNaoEncontrados`, só quem o Google ainda não consultou.
 */
export function filtroPendentes(
  empresaId: string,
  incluirNaoEncontrados: boolean,
) {
  return {
    empresaId,
    deletedAt: null,
    ativo: true,
    OR: [{ latitude: null }, { longitude: null }],
    AND: [
      { endereco: { not: null } },
      { endereco: { not: '' } },
      { municipio: { not: null } },
      { municipio: { not: '' } },
      { uf: { not: null } },
      { uf: { not: '' } },
    ],
    ...(incluirNaoEncontrados ? {} : { coordenadasConsultadasEm: null }),
  };
}

/**
 * Lote dos clientes sem coordenadas (botão da tela Administração >
 * Geolocalização). Corre em segundo plano e a tela acompanha pela situação.
 *
 * O andamento fica em memória, um por empresa: se a API reiniciar no meio, o
 * lote para e a tela volta a mostrar os pendentes — quem já foi consultado
 * ficou marcado e não é cobrado de novo.
 *
 * Coordenada achada entra pela fila de alterações com origem `geocodificacao`,
 * aplicada direto (decisão de 16/11/2026: é preenchimento de campo vazio, e
 * vai ao ERP como qualquer alteração).
 */
@Injectable()
export class GeocodificacaoLoteService {
  private readonly logger = new Logger(GeocodificacaoLoteService.name);
  private readonly situacoes = new Map<string, GeocodificacaoLoteSituacao>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeocodificacaoService,
    private readonly alteracoes: ClienteAlteracoesService,
  ) {}

  situacao(empresaId: string): GeocodificacaoLoteSituacao {
    return this.situacoes.get(empresaId) ?? SITUACAO_VAZIA;
  }

  /** Quantos o lote pegaria e quantos o Google já não achou. */
  async contagem(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [pendentes, comNaoEncontrados] = await Promise.all([
        tx.cliente.count({ where: filtroPendentes(empresaId, false) }),
        tx.cliente.count({ where: filtroPendentes(empresaId, true) }),
      ]);
      return { pendentes, naoEncontrados: comNaoEncontrados - pendentes };
    });
  }

  async iniciar(
    empresaId: string,
    user: AuthenticatedUser,
    body: GeocodificacaoLoteBody,
  ): Promise<GeocodificacaoLoteSituacao> {
    if (this.situacao(empresaId).rodando) {
      throw new ConflictException('O lote de coordenadas já está rodando');
    }
    const cfg = await this.geo.config(empresaId);
    if (!this.geo.habilitado(cfg)) {
      throw new ConflictException(
        'Geolocalização desabilitada ou sem chave. Configure e salve antes de rodar o lote.',
      );
    }

    const clientes = await this.prisma.withTenant(empresaId, (tx) =>
      tx.cliente.findMany({
        where: filtroPendentes(empresaId, body.incluirNaoEncontrados),
        orderBy: { razaoSocial: 'asc' },
        take: cfg.loteLimite,
        select: {
          id: true,
          endereco: true,
          bairro: true,
          municipio: true,
          uf: true,
          cep: true,
          latitude: true,
          longitude: true,
        },
      }),
    );

    const situacao: GeocodificacaoLoteSituacao = {
      ...SITUACAO_VAZIA,
      rodando: true,
      iniciadoEm: new Date().toISOString(),
      total: clientes.length,
    };
    this.situacoes.set(empresaId, situacao);

    // Sem await: a requisição volta na hora e a tela acompanha.
    void this.executar(empresaId, user.id, cfg, clientes, situacao);
    return situacao;
  }

  private async executar(
    empresaId: string,
    autorId: string,
    cfg: Awaited<ReturnType<GeocodificacaoService['config']>>,
    clientes: Array<{
      id: string;
      endereco: string | null;
      bairro: string | null;
      municipio: string | null;
      uf: string | null;
      cep: string | null;
      latitude: number | null;
      longitude: number | null;
    }>,
    s: GeocodificacaoLoteSituacao,
  ) {
    let falhasSeguidas = 0;
    try {
      for (const cliente of clientes) {
        const endereco = textoDoEndereco(cliente);
        if (!endereco) {
          s.processados++;
          continue;
        }
        const r = await this.geo.consultar(cfg, endereco);
        if (r.tipo === 'erro') {
          s.erros++;
          s.processados++;
          falhasSeguidas++;
          if (r.fatal || falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
            s.erro = r.mensagem;
            break;
          }
          await dormir(INTERVALO_MS);
          continue;
        }
        falhasSeguidas = 0;
        try {
          await this.prisma.withTenant(empresaId, async (tx) => {
            if (r.tipo === 'encontrado') {
              await this.alteracoes.registrar(tx, {
                empresaId,
                clienteId: cliente.id,
                atual: cliente,
                input: { latitude: r.latitude, longitude: r.longitude },
                origem: 'geocodificacao',
                autorId,
                aplicarDireto: true,
                justificativa: r.enderecoFormatado
                  ? `Google: ${r.enderecoFormatado}`
                  : null,
                registrarNaAgenda: false,
              });
            }
            await tx.cliente.update({
              where: { id: cliente.id },
              data: { coordenadasConsultadasEm: new Date() },
            });
          });
          if (r.tipo === 'encontrado') s.encontrados++;
          else s.naoEncontrados++;
        } catch (erro) {
          s.erros++;
          this.logger.warn(
            `Coordenadas do cliente ${cliente.id} não gravadas: ${(erro as Error).message}`,
          );
        }
        s.processados++;
        await dormir(INTERVALO_MS);
      }
    } catch (erro) {
      s.erro = (erro as Error).message;
      this.logger.error(`Lote de coordenadas parou: ${s.erro}`);
    } finally {
      s.rodando = false;
      s.concluidoEm = new Date().toISOString();
    }
  }
}
