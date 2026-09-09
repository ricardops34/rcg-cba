import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  TermoAceiteInput,
  TermoAceiteResult,
  TermoDocumento,
  TermosStatus,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const DECLARACAO_ACEITE =
  'Li e concordo com esta versão do documento apresentado.';
const CACHE_PENDENCIA_MS = 60_000;

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class TermosService {
  private readonly pendenciaCache = new Map<
    string,
    { valor: boolean; expiraEm: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Checagem curta usada pelo guard em toda rota autenticada. */
  async temPendente(usuarioId: string): Promise<boolean> {
    const cache = this.pendenciaCache.get(usuarioId);
    if (cache && cache.expiraEm > Date.now()) return cache.valor;

    const agora = new Date();
    const quantidade = await this.prisma.termoDocumento.count({
      where: {
        obrigatorio: true,
        publicadoEm: { lte: agora },
        vigenteEm: { lte: agora },
        revogadoEm: null,
        aceites: { none: { usuarioId } },
      },
    });
    const valor = quantidade > 0;
    this.pendenciaCache.set(usuarioId, {
      valor,
      expiraEm: Date.now() + CACHE_PENDENCIA_MS,
    });
    return valor;
  }

  async status(usuarioId: string): Promise<TermosStatus> {
    const agora = new Date();
    const [pendentes, aceites] = await Promise.all([
      this.prisma.termoDocumento.findMany({
        where: {
          obrigatorio: true,
          publicadoEm: { lte: agora },
          vigenteEm: { lte: agora },
          revogadoEm: null,
          aceites: { none: { usuarioId } },
        },
        orderBy: [{ vigenteEm: 'asc' }, { codigo: 'asc' }],
      }),
      this.prisma.termoAceite.findMany({
        where: { usuarioId },
        include: {
          termo: {
            select: { codigo: true, versao: true, titulo: true },
          },
        },
        orderBy: { aceitoEm: 'desc' },
      }),
    ]);

    const possuiPendencia = pendentes.length > 0;
    this.pendenciaCache.set(usuarioId, {
      valor: possuiPendencia,
      expiraEm: Date.now() + CACHE_PENDENCIA_MS,
    });

    return {
      possuiPendencia,
      pendentes: pendentes.map((termo) => this.paraContrato(termo)),
      aceites: aceites.map((aceite) => ({
        termoId: aceite.termoId,
        codigo: aceite.termo.codigo,
        versao: aceite.termo.versao,
        titulo: aceite.termo.titulo,
        aceitoEm: aceite.aceitoEm.toISOString(),
      })),
    };
  }

  async aceitar(
    user: AuthenticatedUser,
    termoId: string,
    input: TermoAceiteInput,
    meta: RequestMeta,
  ): Promise<TermoAceiteResult> {
    const agora = new Date();
    const termo = await this.prisma.termoDocumento.findFirst({
      where: {
        id: termoId,
        obrigatorio: true,
        publicadoEm: { lte: agora },
        vigenteEm: { lte: agora },
        revogadoEm: null,
      },
    });
    if (!termo) throw new NotFoundException('Termo vigente não encontrado');
    if (termo.conteudoHash !== input.conteudoHash) {
      throw new ConflictException(
        'O documento foi atualizado. Recarregue a página antes de aceitar.',
      );
    }

    const aceite = await this.prisma.termoAceite.upsert({
      where: {
        termoId_usuarioId: { termoId: termo.id, usuarioId: user.id },
      },
      update: {},
      create: {
        termoId: termo.id,
        usuarioId: user.id,
        empresaContextoId: user.empresaAtivaId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        conteudoHash: termo.conteudoHash,
        declaracao: DECLARACAO_ACEITE,
      },
    });

    this.pendenciaCache.delete(user.id);
    return {
      aceito: true,
      termoId: termo.id,
      aceitoEm: aceite.aceitoEm.toISOString(),
    };
  }

  private paraContrato(termo: {
    id: string;
    codigo: string;
    versao: string;
    tipo: 'termos_uso' | 'aviso_privacidade';
    titulo: string;
    resumo: string;
    conteudo: string;
    conteudoHash: string;
    vigenteEm: Date;
  }): TermoDocumento {
    return {
      id: termo.id,
      codigo: termo.codigo,
      versao: termo.versao,
      tipo: termo.tipo,
      titulo: termo.titulo,
      resumo: termo.resumo,
      conteudo: termo.conteudo,
      conteudoHash: termo.conteudoHash,
      vigenteEm: termo.vigenteEm.toISOString(),
    };
  }
}

