import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { gerarDemo, apagarDemo, type ResumoDemo } from './demo-gerador';
import { limparBaseDaEmpresa, type ResumoLimpeza } from './demo-limpeza';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Base de demonstração de **uma empresa escolhida**, a partir do detalhe dela
 * em Administração > Empresas.
 *
 * Tudo roda dentro de `withTenant`, então valem as policies de RLS
 * (`USING ("empresaId" = current_setting('app.current_empresa_id', true))`, que
 * sem `WITH CHECK` explícito o Postgres reaproveita na checagem de INSERT).
 *
 * **Mas atenção ao que a RLS faz e ao que não faz aqui.** Ela escopa para o
 * `empresaId` que este código define — protege contra esquecer um filtro, não
 * contra passar o id errado de propósito. Como estas rotas recebem a empresa
 * por parâmetro, quem decide o alcance é `garantirAlcance`, abaixo. Era essa a
 * diferença de aceitar `empresaId`, e é por isso que a checagem é explícita.
 *
 * O script de linha de comando faz o mesmo trabalho com a role dona
 * (`plataforma`), fora do `withTenant` e portanto sem RLS nenhuma.
 */

/**
 * Teto da transação, bem acima do padrão de 5 s do Prisma.
 *
 * Oito meses de movimento são milhares de linhas mais um XML de NF-e por
 * nota. O padrão estoura com folga, e o sintoma seria uma transação abortada
 * no meio — sem dado gravado, mas com o operador achando que o botão não
 * funciona.
 */
const LIMITE_GERACAO_MS = 10 * 60_000;

/** A limpeza é só `deleteMany` em sequência: rápida, mas a base pode ser grande. */
const LIMITE_LIMPEZA_MS = 5 * 60_000;

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Esta pessoa alcança esta empresa?
   *
   * Mesmo recorte de `EmpresasService.findAll`: administrador da plataforma
   * alcança todas; os demais, só as empresas a que estão vinculados. Sem isto,
   * bastaria trocar o id na requisição para apagar a base de quem não se
   * administra — a RLS não barraria, porque ela obedece ao id que o código
   * mandar.
   */
  private async garantirAlcance(user: AuthenticatedUser, empresaId: string) {
    if (user.administradorPlataforma) return;

    const vinculo = await this.prisma.usuarioEmpresa.findFirst({
      where: {
        usuarioId: user.id,
        empresaId,
        ativo: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!vinculo) {
      // Mesma mensagem para "não existe" e "não é sua": responder coisas
      // diferentes transformaria esta rota num jeito de descobrir quais
      // empresas existem no cluster.
      throw new ForbiddenException('Empresa não encontrada.');
    }
  }

  /**
   * Popula a empresa com o conjunto de demonstração.
   *
   * Numa transação só: a geração é uma coisa só, e meia base de demonstração
   * (clientes sem notas, notas sem títulos) é pior do que nenhuma, porque
   * parece pronta até alguém abrir a tela errada na frente do cliente.
   */
  async gerar(user: AuthenticatedUser, empresaId: string): Promise<ResumoDemo> {
    await this.garantirAlcance(user, empresaId);
    this.logger.warn(
      `Gerando base de demonstração na empresa ${empresaId} a pedido de ${user.email}`,
    );
    return this.prisma.withTenant(empresaId, (tx) => gerarDemo(tx, empresaId), {
      timeout: LIMITE_GERACAO_MS,
    });
  }

  /** Remove só o conjunto `DEMO-`, deixando o cadastro real onde está. */
  async removerDemo(user: AuthenticatedUser, empresaId: string): Promise<void> {
    await this.garantirAlcance(user, empresaId);
    this.logger.warn(
      `Removendo dados de demonstração da empresa ${empresaId} a pedido de ${user.email}`,
    );
    await this.prisma.withTenant(empresaId, (tx) => apagarDemo(tx, empresaId), {
      timeout: LIMITE_LIMPEZA_MS,
    });
  }

  /**
   * Apaga **todo** o dado de negócio da empresa. Irreversível.
   *
   * O que sobrevive está listado em `demo-limpeza.ts`: acesso, configuração,
   * credenciais e auditoria. A trilha de auditoria fica de fora de propósito —
   * uma operação destrutiva que apaga o próprio registro é exatamente o que a
   * auditoria existe para impedir.
   */
  async limparBase(
    user: AuthenticatedUser,
    empresaId: string,
  ): Promise<ResumoLimpeza> {
    await this.garantirAlcance(user, empresaId);
    this.logger.warn(
      `LIMPEZA TOTAL da base da empresa ${empresaId} a pedido de ${user.email}`,
    );
    return this.prisma.withTenant(empresaId, (tx) => limparBaseDaEmpresa(tx), {
      timeout: LIMITE_LIMPEZA_MS,
    });
  }

  /** A razão social, para conferir contra o que o usuário digitou. */
  async razaoSocialDe(
    user: AuthenticatedUser,
    empresaId: string,
  ): Promise<string> {
    await this.garantirAlcance(user, empresaId);
    const empresa = await this.prisma.empresa.findUniqueOrThrow({
      where: { id: empresaId },
      select: { razaoSocial: true },
    });
    return empresa.razaoSocial;
  }
}
