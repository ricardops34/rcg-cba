import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { ProvedorFactory } from './provedor.factory';
import { cifrar, decifrar, ultimos4 } from './agente-cripto';
import {
  PROVEDORES,
  SYSTEM_PROMPT_PADRAO,
  type AgenteConfigUpdate,
  type ProvedorIa,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Config já resolvida para uso interno — com a chave em claro. */
export interface ConfigParaUso {
  provedor: ProvedorIa;
  baseUrl: string;
  apiKey: string;
  modelo: string;
  temperatura: number;
  maxTokens: number;
  maxIteracoesFerramentas: number;
  historicoMensagens: number;
  systemPrompt: string | null;
}

/**
 * Configuração do agente por empresa (singleton, padrão do OrcamentoConfig).
 *
 * A chave de API **nunca** sai da API: a leitura devolve apenas os últimos 4
 * caracteres e a marca de preenchida.
 *
 * As chaves ficam numa tabela por provedor (`AgenteCredencial`), não numa
 * coluna só. É o que faz trocar de provedor custar um clique: alternar entre
 * Claude e Groq mantém as duas chaves gravadas, e voltar traz também o modelo
 * que estava em uso naquele provedor.
 */
@Injectable()
export class AgenteConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provedores: ProvedorFactory,
  ) {}

  async obter(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.agenteConfig.upsert({
        where: { empresaId },
        // Nasce com o system prompt de exemplo preenchido: uma tela em branco
        // não diz ao administrador o que ele deveria escrever ali.
        create: { empresaId, systemPrompt: SYSTEM_PROMPT_PADRAO },
        update: {},
      });
      const credenciais = await tx.agenteCredencial.findMany({
        where: { empresaId },
        select: { provedor: true, apiKeyUltimos4: true, modelo: true },
      });
      return this.paraLeitura(linha, credenciais);
    });
  }

  async atualizar(
    empresaId: string,
    user: AuthenticatedUser,
    input: AgenteConfigUpdate,
  ) {
    const { apiKey, provedor, ...resto } = input;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const atual = await tx.agenteConfig.upsert({
        where: { empresaId },
        create: { empresaId, systemPrompt: SYSTEM_PROMPT_PADRAO },
        update: {},
      });

      const provedorAlvo = (provedor ?? atual.provedor) as ProvedorIa;
      const info = PROVEDORES[provedorAlvo];
      if (!info) {
        throw new BadRequestException(`Provedor desconhecido: ${provedorAlvo}`);
      }

      // Chave nova grava na credencial do provedor alvo — nunca sobrescreve a
      // do outro provedor.
      if (apiKey) {
        await tx.agenteCredencial.upsert({
          where: {
            empresaId_provedor: { empresaId, provedor: provedorAlvo },
          },
          create: {
            empresaId,
            provedor: provedorAlvo,
            apiKeyCifrada: cifrar(apiKey),
            apiKeyUltimos4: ultimos4(apiKey),
            modelo: resto.modelo ?? info.modeloPadrao,
            updatedBy: user.id,
          },
          update: {
            apiKeyCifrada: cifrar(apiKey),
            apiKeyUltimos4: ultimos4(apiKey),
            updatedBy: user.id,
          },
        });
      }

      const trocouProvedor = provedor && provedor !== atual.provedor;
      // Ao trocar de provedor sem informar modelo/endpoint, herda o que já foi
      // usado naquele provedor; se for a primeira vez, usa o padrão dele.
      const credencialAlvo = trocouProvedor
        ? await tx.agenteCredencial.findUnique({
            where: {
              empresaId_provedor: { empresaId, provedor: provedorAlvo },
            },
            select: { modelo: true },
          })
        : null;

      const dados: Record<string, unknown> = {
        ...resto,
        updatedBy: user.id,
        ...(provedor ? { provedor } : {}),
        ...(trocouProvedor
          ? {
              baseUrl: resto.baseUrl ?? info.baseUrl,
              modelo:
                resto.modelo ?? credencialAlvo?.modelo ?? info.modeloPadrao,
            }
          : {}),
      };

      const linha = await tx.agenteConfig.update({
        where: { empresaId },
        data: dados as never,
      });

      // Guarda o modelo em uso na credencial, para a volta trazer a mesma
      // configuração.
      if (linha.modelo) {
        await tx.agenteCredencial.updateMany({
          where: { empresaId, provedor: linha.provedor },
          data: { modelo: linha.modelo },
        });
      }

      const credenciais = await tx.agenteCredencial.findMany({
        where: { empresaId },
        select: { provedor: true, apiKeyUltimos4: true, modelo: true },
      });
      return this.paraLeitura(linha, credenciais);
    });
  }

  /** Uso interno pelo chat. Recusa cedo e com motivo legível. */
  async paraUso(empresaId: string): Promise<ConfigParaUso> {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.agenteConfig.findUnique({ where: { empresaId } });
      if (!linha || !linha.ativo) {
        throw new BadRequestException(
          'O agente de IA está desativado. Ative em Administração > Agente IA.',
        );
      }
      const provedor = linha.provedor as ProvedorIa;
      const apiKey = await this.chaveDe(tx, empresaId, provedor);
      if (!apiKey) {
        throw new BadRequestException(
          `A chave de API do provedor ${PROVEDORES[provedor]?.rotulo ?? provedor} não está configurada. ` +
            'Informe-a em Administração > Agente IA.',
        );
      }
      return {
        provedor,
        baseUrl: linha.baseUrl,
        apiKey,
        modelo: linha.modelo,
        temperatura: linha.temperatura,
        maxTokens: linha.maxTokens,
        maxIteracoesFerramentas: linha.maxIteracoesFerramentas,
        historicoMensagens: linha.historicoMensagens,
        systemPrompt: linha.systemPrompt,
      };
    });
  }

  /**
   * Chave do provedor. Só a tabela por provedor — sem fallback para a coluna
   * antiga de `AgenteConfig`.
   *
   * O fallback existia e estava **errado**: a coluna legada não guardava a que
   * provedor a chave pertencia, então a comparação só podia ser com o provedor
   * *ativo* — que muda exatamente quando se troca de provedor. Na prática, ao
   * trocar para a Anthropic o sistema mandava a chave da Groq para lá. A
   * migration `agente_credencial_legada` moveu essas chaves para cá com o
   * provedor correto e zerou a coluna.
   */
  private async chaveDe(
    tx: TenantTx,
    empresaId: string,
    provedor: ProvedorIa,
  ): Promise<string | null> {
    const credencial = await tx.agenteCredencial.findUnique({
      where: { empresaId_provedor: { empresaId, provedor } },
      select: { apiKeyCifrada: true },
    });
    return credencial ? decifrar(credencial.apiKeyCifrada) : null;
  }

  /**
   * Testa a chave contra o provedor e devolve os modelos da conta — é o que
   * permite validar o campo `modelo` contra a realidade em vez de uma lista
   * fixa no código.
   */
  async testarConexao(
    empresaId: string,
    apiKeyInformada?: string,
    provedorInformado?: ProvedorIa,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const linha = await tx.agenteConfig.findUnique({ where: { empresaId } });
      const provedor =
        provedorInformado ?? ((linha?.provedor ?? 'anthropic') as ProvedorIa);
      const info = PROVEDORES[provedor];
      const baseUrl =
        provedor === (linha?.provedor as ProvedorIa)
          ? (linha?.baseUrl ?? info.baseUrl)
          : info.baseUrl;

      // Permite testar uma chave antes de gravá-la.
      const apiKey = apiKeyInformada
        ? apiKeyInformada
        : linha
          ? await this.chaveDe(tx, empresaId, provedor)
          : null;
      if (!apiKey) {
        throw new BadRequestException(
          'Informe a chave de API para testar, ou grave-a primeiro.',
        );
      }
      const modelos = await this.provedores
        .para(provedor)
        .listarModelos(baseUrl, apiKey);
      return { ok: true, provedor, modelos };
    });
  }

  private paraLeitura(
    linha: {
      id: string;
      empresaId: string;
      ativo: boolean;
      provedor: string;
      baseUrl: string;
      modelo: string;
      apiKeyUltimos4: string | null;
      apiKeyCifrada: string | null;
      systemPrompt: string | null;
      temperatura: number;
      maxTokens: number;
      maxIteracoesFerramentas: number;
      historicoMensagens: number;
    },
    credenciais: {
      provedor: string;
      apiKeyUltimos4: string;
      modelo: string | null;
    }[],
  ) {
    const doProvedor = credenciais.find((c) => c.provedor === linha.provedor);
    return {
      id: linha.id,
      empresaId: linha.empresaId,
      ativo: linha.ativo,
      provedor: linha.provedor,
      baseUrl: linha.baseUrl,
      modelo: linha.modelo,
      apiKeyUltimos4: doProvedor?.apiKeyUltimos4 ?? null,
      apiKeyPreenchida: !!doProvedor,
      systemPrompt: linha.systemPrompt,
      temperatura: linha.temperatura,
      maxTokens: linha.maxTokens,
      maxIteracoesFerramentas: linha.maxIteracoesFerramentas,
      historicoMensagens: linha.historicoMensagens,
      // A tela usa isto para mostrar quais provedores já têm chave gravada —
      // é o que torna a troca um clique em vez de uma recolagem.
      credenciais: credenciais.map((c) => ({
        provedor: c.provedor,
        apiKeyUltimos4: c.apiKeyUltimos4,
        apiKeyPreenchida: true,
        modelo: c.modelo,
      })),
    };
  }
}
