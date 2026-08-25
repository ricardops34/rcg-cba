import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { AgenteToolsService } from './agente-tools.service';
import type { AgenteFerramentaUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Configuração gravada de uma ferramenta. Nulo em nome/descrição = usa o código. */
export interface ConfigFerramenta {
  ativa: boolean;
  nome: string | null;
  descricao: string | null;
  perfilIds: string[];
}

/**
 * O que o laço de conversa precisa para filtrar o catálogo: a configuração da
 * empresa e o perfil de quem está perguntando.
 */
export interface FiltroFerramentas {
  config: Map<string, ConfigFerramenta>;
  perfilId: string | null;
}

/**
 * Governança das ferramentas do agente, por empresa.
 *
 * Separa duas coisas que antes eram uma só: **o que a ferramenta faz** (código,
 * em `AgenteToolsService`) e **o que a empresa decidiu sobre ela** (banco).
 * Ligar/desligar, reescrever a descrição que ensina o modelo quando usá-la, e
 * limitar a perfis específicos passam a ser configuração — sem deploy.
 *
 * A regra que não pode ser quebrada: isto **restringe, nunca amplia**. A
 * `permissao` declarada no código continua sendo checada em
 * `AgenteToolsService.permitida`, e nenhuma configuração daqui a contorna —
 * senão a tela de administração viraria um caminho para dar acesso a dados por
 * fora do RBAC.
 *
 * Este serviço depende do de ferramentas, e não o contrário: quem monta a
 * conversa busca o filtro aqui e o passa adiante. É o que evita a dependência
 * circular e mantém `AgenteToolsService` sem I/O.
 */
@Injectable()
export class AgenteFerramentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: AgenteToolsService,
  ) {}

  /** Lista para a tela: padrão do código + sobrescrita gravada. */
  async listar(empresaId: string) {
    const catalogo = this.tools.catalogo();

    const linhas = await this.prisma.withTenant(empresaId, async (tx) => {
      await this.sincronizar(
        tx,
        empresaId,
        catalogo.map((c) => c.chave),
      );
      return tx.agenteFerramenta.findMany({
        where: { empresaId },
        include: { perfis: { select: { perfilId: true } } },
      });
    });

    const porChave = new Map(linhas.map((l) => [l.chave, l]));

    // O catálogo do código manda na ordem e no conjunto: linha órfã (de uma
    // ferramenta removida numa versão anterior) não aparece na tela.
    return catalogo.map((c) => {
      const linha = porChave.get(c.chave);
      return {
        chave: c.chave,
        ativa: linha?.ativa ?? true,
        nome: linha?.nome || c.nome,
        descricao: linha?.descricao || c.descricao,
        nomePadrao: c.nome,
        descricaoPadrao: c.descricao,
        permissao: c.permissao,
        escrita: c.escrita,
        perfilIds: linha?.perfis.map((p) => p.perfilId) ?? [],
      };
    });
  }

  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    chave: string,
    input: AgenteFerramentaUpdate,
  ) {
    const doCatalogo = this.tools.catalogo().find((c) => c.chave === chave);
    if (!doCatalogo) {
      throw new NotFoundException(`Ferramenta "${chave}" não existe`);
    }

    await this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.agenteFerramenta.upsert({
        where: { empresaId_chave: { empresaId, chave } },
        create: { empresaId, chave, updatedBy: user.id },
        update: {
          ...(input.ativa !== undefined ? { ativa: input.ativa } : {}),
          // Texto vazio limpa a sobrescrita e devolve o padrão do código —
          // é como a tela oferece o "voltar ao original" sem um botão extra.
          ...(input.nome !== undefined ? { nome: input.nome || null } : {}),
          ...(input.descricao !== undefined
            ? { descricao: input.descricao || null }
            : {}),
          updatedBy: user.id,
        },
      });

      if (input.perfilIds) {
        // Troca o conjunto inteiro: a tela manda a seleção completa, e um
        // diff aqui só criaria caminhos para divergir do que está na tela.
        await tx.agenteFerramentaPerfil.deleteMany({
          where: { empresaId, ferramentaId: linha.id },
        });
        if (input.perfilIds.length > 0) {
          await tx.agenteFerramentaPerfil.createMany({
            data: input.perfilIds.map((perfilId) => ({
              empresaId,
              ferramentaId: linha.id,
              perfilId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.listar(empresaId);
  }

  /** Configuração + perfil do usuário, para o filtro do laço de conversa. */
  async filtroPara(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<FiltroFerramentas> {
    const { linhas, vinculo } = await this.prisma.withTenant(
      empresaId,
      async (tx) => ({
        linhas: await tx.agenteFerramenta.findMany({
          where: { empresaId },
          include: { perfis: { select: { perfilId: true } } },
        }),
        // O perfil não vem no JWT, então é uma consulta por conversa. Barata,
        // e preferível a inflar o token com um dado que muda sem novo login.
        vinculo: await tx.usuarioEmpresa.findFirst({
          where: { empresaId, usuarioId: user.id, ativo: true },
          select: { perfilId: true },
        }),
      }),
    );

    return {
      config: new Map(
        linhas.map((l) => [
          l.chave,
          {
            ativa: l.ativa,
            nome: l.nome,
            descricao: l.descricao,
            perfilIds: l.perfis.map((p) => p.perfilId),
          },
        ]),
      ),
      perfilId: vinculo?.perfilId ?? null,
    };
  }

  /**
   * Garante uma linha por ferramenta do catálogo.
   *
   * Ferramenta nova nasce **ativa e sem restrição de perfil**: é o
   * comportamento que existia antes desta tabela, e é o que evita que subir
   * uma versão nova apague silenciosamente uma capacidade que ninguém pediu
   * para desligar.
   */
  private async sincronizar(
    tx: TenantTx,
    empresaId: string,
    chaves: string[],
  ): Promise<void> {
    const existentes = await tx.agenteFerramenta.findMany({
      where: { empresaId },
      select: { chave: true },
    });
    const faltando = chaves.filter(
      (c) => !existentes.some((e) => e.chave === c),
    );
    if (faltando.length === 0) return;

    await tx.agenteFerramenta.createMany({
      data: faltando.map((chave) => ({ empresaId, chave })),
      skipDuplicates: true,
    });
  }
}
