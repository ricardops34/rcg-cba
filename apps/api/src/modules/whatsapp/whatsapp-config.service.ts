import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '../../common/prisma/prisma.service';
import type { WhatsappConfigUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { cifrarSegredo, decifrarSeHouver, ultimos4 } from './whatsapp-cripto';
import type { TemplateSincronizado } from './providers/whatsapp-provider';

/**
 * Configuração do WhatsApp por empresa (singleton, padrão do AgenteConfig e
 * do OrcamentoConfig): upsert preguiçoso no primeiro acesso, para a tela nunca
 * precisar tratar "ainda não existe".
 *
 * Aqui fica o que é decisão da empresa — transporte, endereços dos provedores,
 * credencial do gateway e retenção. O que é do vendedor (o número conectado e
 * a instância dele) mora em WhatsappSessao.
 *
 * **Duas leituras, de propósito.** `obter` devolve a linha inteira e é para
 * uso interno: quem conecta precisa da chave cifrada para decidir se dá para
 * conectar. `paraLeitura` é o que vai para o navegador, e nele a chave da
 * Evolution GO some — sobram os últimos 4 caracteres, o bastante para o
 * administrador reconhecer qual chave está lá sem que ela trafegue.
 */
@Injectable()
export class WhatsappConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async obter(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappConfig.upsert({
        where: { empresaId },
        create: { empresaId },
        update: {},
      }),
    );
  }

  /**
   * Só se a integração está ligada — leitura pública a qualquer usuário
   * autenticado, porque é o que decide se o Atendimento aparece no menu e na
   * tela inicial do vendedor.
   *
   * Diferente de `obter`, não faz upsert: uma consulta de menu não pode
   * escrever, e empresa sem linha é exatamente o caso de integração desligada.
   */
  async statusIntegracao(empresaId: string) {
    const config = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappConfig.findUnique({
        where: { empresaId },
        select: { ativo: true },
      }),
    );
    return { ativo: config?.ativo ?? false };
  }

  /** O que a tela recebe: sem a chave da Evolution GO. */
  async paraLeitura(empresaId: string) {
    return this.sanitizar(await this.obter(empresaId));
  }

  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    input: WhatsappConfigUpdate,
  ) {
    // As chaves não são gravadas como vieram: separadas aqui, cifradas abaixo,
    // e nunca devolvidas. String vazia é o jeito de a tela apagar a chave
    // existente sem precisar de uma rota só para isso — `undefined` (campo
    // ausente) mantém a que já está lá, que é o caso de quem salvou o
    // formulário sem tocá-la.
    const {
      evolutionApiKey,
      cloudApiAccessToken,
      cloudApiAppSecret,
      ...resto
    } = input;

    return this.prisma.withTenant(empresaId, async (tx) => {
      await tx.whatsappConfig.upsert({
        where: { empresaId },
        create: { empresaId },
        update: {},
      });
      const atualizada = await tx.whatsappConfig.update({
        where: { empresaId },
        data: {
          ...resto,
          ...(evolutionApiKey === undefined
            ? {}
            : {
                evolutionApiKeyCifrada: evolutionApiKey
                  ? cifrarSegredo(evolutionApiKey)
                  : null,
              }),
          ...(cloudApiAccessToken === undefined
            ? {}
            : {
                cloudApiAccessTokenCifrada: cloudApiAccessToken
                  ? cifrarSegredo(cloudApiAccessToken)
                  : null,
              }),
          ...(cloudApiAppSecret === undefined
            ? {}
            : {
                cloudApiAppSecretCifrada: cloudApiAppSecret
                  ? cifrarSegredo(cloudApiAppSecret)
                  : null,
              }),
          updatedBy: user.id,
        },
      });
      return this.sanitizar(atualizada);
    });
  }

  /** Só o verify token — leitura direta, sem upsert (webhook não autenticado). */
  async webhookVerifyToken(empresaId: string): Promise<string | null> {
    const config = await this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappConfig.findUnique({
        where: { empresaId },
        select: { cloudApiWebhookVerifyToken: true },
      }),
    );
    return config?.cloudApiWebhookVerifyToken ?? null;
  }

  /** Templates sincronizados da empresa, para o seletor de envio. */
  async listarTemplates(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.whatsappTemplate.findMany({
        where: { empresaId },
        orderBy: { nome: 'asc' },
      }),
    );
  }

  /**
   * Upsert por `metaId` — não apaga o que não veio na resposta da Meta:
   * um template pausado ou desativado lá continua aparecendo aqui com o
   * status atualizado, e é isso que a tela precisa mostrar (não sumir sem
   * explicação).
   */
  async upsertTemplates(empresaId: string, templates: TemplateSincronizado[]) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      for (const template of templates) {
        await tx.whatsappTemplate.upsert({
          where: {
            empresaId_metaId: { empresaId, metaId: template.metaId },
          },
          create: {
            empresaId,
            metaId: template.metaId,
            nome: template.nome,
            idioma: template.idioma,
            categoria: template.categoria,
            status: template.status,
            componentes: template.componentes as Prisma.InputJsonValue,
          },
          update: {
            nome: template.nome,
            idioma: template.idioma,
            categoria: template.categoria,
            status: template.status,
            componentes: template.componentes as Prisma.InputJsonValue,
            sincronizadoEm: new Date(),
          },
        });
      }
      return tx.whatsappTemplate.findMany({
        where: { empresaId },
        orderBy: { nome: 'asc' },
      });
    });
  }

  /**
   * Troca a chave cifrada pelo rastro do que existe.
   *
   * Os últimos 4 caracteres saem da chave em claro, então dependem de a chave
   * mestra ainda decifrá-la: trocada a `WHATSAPP_CRYPTO_KEY`, a tela mostra
   * "definida" sem os dígitos — o que já é o sinal de que ela precisa ser
   * regravada.
   */
  private sanitizar<
    T extends {
      evolutionApiKeyCifrada: string | null;
      cloudApiAccessTokenCifrada: string | null;
      cloudApiAppSecretCifrada: string | null;
    },
  >(config: T) {
    const {
      evolutionApiKeyCifrada,
      cloudApiAccessTokenCifrada,
      cloudApiAppSecretCifrada,
      ...visivel
    } = config;
    const emClaro = decifrarSeHouver(evolutionApiKeyCifrada);
    return {
      ...visivel,
      evolutionApiKeyDefinida: Boolean(evolutionApiKeyCifrada),
      evolutionApiKeyUltimos4: emClaro ? ultimos4(emClaro) : null,
      // Token e App Secret nunca voltam nem em rastro de últimos dígitos —
      // diferente da Evolution GO, o Access Token da Cloud API sozinho já
      // fala pelo número da empresa inteira, sem instância nenhuma no meio.
      cloudApiAccessTokenDefinida: Boolean(cloudApiAccessTokenCifrada),
      cloudApiAppSecretDefinida: Boolean(cloudApiAppSecretCifrada),
    };
  }
}
