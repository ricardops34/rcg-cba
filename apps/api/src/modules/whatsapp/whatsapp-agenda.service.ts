import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappWorkerClient } from './whatsapp-worker.client';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** O que o worker devolve, antes de cruzar com o cadastro. */
type ContatoDoAparelho = {
  jid: string;
  nome: string | null;
  telefone: string | null;
  naoLidas?: number;
};

/**
 * Agenda e conversas **do aparelho** do vendedor.
 *
 * Existe porque a tela sem isso só sabe da existência de quem escreveu
 * primeiro: o vendedor tinha o cliente na agenda do celular há anos e não
 * conseguia começar uma conversa por aqui.
 *
 * Três regras que este serviço carrega:
 *
 * 1. **Sempre a sessão do próprio usuário.** Nenhum método aceita `sessaoId`
 *    de fora. A agenda de um vendedor é o catálogo pessoal dele — supervisor
 *    lê as conversas da equipe (isso é regra do módulo), mas não a agenda.
 * 2. **Nada disso é gravado.** A lista é lida do provedor e cruzada com o
 *    cadastro em memória; o que entra no nosso banco é só o que o vendedor
 *    escolher vincular. Copiar 800 contatos pessoais para dentro da
 *    plataforma seria o oposto do que a Fase 6 do plano decidiu.
 * 3. **O casamento com cliente respeita a carteira** — o mesmo
 *    `resolverEscopoVendedores` do resto do sistema.
 */
@Injectable()
export class WhatsappAgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsappConfigService,
    private readonly sessoes: WhatsappSessaoService,
    private readonly worker: WhatsappWorkerClient,
  ) {}

  /** Sessão conectada do usuário — sem ela não há agenda a consultar. */
  private async sessaoConectada(empresaId: string, user: AuthenticatedUser) {
    const sessao = await this.sessoes.minha(empresaId, user);
    if (!sessao || sessao.status !== 'conectada') {
      throw new BadRequestException(
        'Seu WhatsApp não está conectado. Conecte o aparelho para ver a agenda.',
      );
    }
    return sessao;
  }

  /** Contatos da agenda do celular, já cruzados com a carteira do vendedor. */
  async contatos(empresaId: string, user: AuthenticatedUser, busca?: string) {
    const sessao = await this.sessaoConectada(empresaId, user);
    const config = await this.config.obter(empresaId);

    const doAparelho = await this.worker.chamar<ContatoDoAparelho[]>(
      config.workerUrl,
      `/sessoes/${sessao.id}/contatos${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`,
    );

    return this.cruzarComCadastro(empresaId, user, sessao.id, doAparelho);
  }

  /** Conversas que já existem no celular, mesmo sem mensagem nova por aqui. */
  async conversasDoAparelho(empresaId: string, user: AuthenticatedUser) {
    const sessao = await this.sessaoConectada(empresaId, user);
    const config = await this.config.obter(empresaId);

    const doAparelho = await this.worker.chamar<ContatoDoAparelho[]>(
      config.workerUrl,
      `/sessoes/${sessao.id}/conversas`,
    );

    return this.cruzarComCadastro(empresaId, user, sessao.id, doAparelho);
  }

  /**
   * Refaz a agenda a partir do celular.
   *
   * O provedor só manda o que mudou desde a última sincronização — contato
   * novo aparece sozinho, mas quando a lista se perde (foi o caso na primeira
   * implantação, com as tabelas ainda inexistentes) só um pedido explícito a
   * traz de volta. Daí este botão existir na tela.
   */
  async sincronizar(empresaId: string, user: AuthenticatedUser) {
    const sessao = await this.sessaoConectada(empresaId, user);
    const config = await this.config.obter(empresaId);
    await this.worker.chamar(
      config.workerUrl,
      `/sessoes/${sessao.id}/agenda/sincronizar`,
      { metodo: 'POST' },
    );
    return { ok: true };
  }

  /**
   * Cruza a lista do aparelho com o cadastro: quem já é cliente da carteira,
   * quem já tem conversa aberta por aqui.
   *
   * Feito em duas consultas para a lista inteira, não uma por contato: são
   * centenas de linhas, e o N+1 aqui seria visível na tela.
   */
  private async cruzarComCadastro(
    empresaId: string,
    user: AuthenticatedUser,
    sessaoId: string,
    doAparelho: ContatoDoAparelho[],
  ) {
    if (doAparelho.length === 0) return [];

    return this.prisma.withTenant(empresaId, async (tx) => {
      const jids = doAparelho.map((c) => c.jid);
      const sufixos = doAparelho
        .map((c) => this.sufixo(c.telefone))
        .filter((s): s is string => s !== null);

      const [contatosLocais, conversas, porTelefone] = await Promise.all([
        tx.whatsappContato.findMany({
          where: { jid: { in: jids } },
          select: {
            id: true,
            jid: true,
            clienteId: true,
            ignorado: true,
            cliente: { select: { razaoSocial: true, codigoErp: true } },
          },
        }),
        tx.whatsappConversa.findMany({
          where: { sessaoId, contato: { jid: { in: jids } } },
          select: { id: true, contato: { select: { jid: true } } },
        }),
        this.clientesPorTelefone(tx, empresaId, user, sufixos),
      ]);

      const local = new Map(contatosLocais.map((c) => [c.jid, c]));
      const conversaPorJid = new Map(
        conversas.map((c) => [c.contato.jid, c.id]),
      );

      return doAparelho.map((contato) => {
        const gravado = local.get(contato.jid);
        const sufixo = this.sufixo(contato.telefone);
        // Sugestão só quando o telefone aponta para **um** cliente: dois
        // clientes com o mesmo número não viram palpite (a mesma regra do
        // casamento automático no recebimento).
        const sugestao = sufixo ? porTelefone.get(sufixo) : undefined;

        return {
          jid: contato.jid,
          nome: contato.nome,
          telefone: contato.telefone,
          naoLidas: contato.naoLidas ?? 0,
          // Vínculo já existente vence a sugestão: é decisão tomada.
          clienteId: gravado?.clienteId ?? null,
          clienteRazaoSocial: gravado?.cliente?.razaoSocial ?? null,
          clienteCodigoErp: gravado?.cliente?.codigoErp ?? null,
          ignorado: gravado?.ignorado ?? false,
          conversaId: conversaPorJid.get(contato.jid) ?? null,
          sugestaoClienteId: gravado?.clienteId ? null : (sugestao?.id ?? null),
          sugestaoClienteNome: gravado?.clienteId
            ? null
            : (sugestao?.razaoSocial ?? null),
        };
      });
    });
  }

  /**
   * Clientes da carteira cujos telefones batem com a lista, indexados pelos
   * últimos 8 dígitos — cobre com e sem DDI 55 e com e sem o 9º dígito sem
   * precisar normalizar a base inteira.
   *
   * Telefone que aponta para mais de um cliente sai do mapa: ambiguidade não
   * vira sugestão.
   */
  private async clientesPorTelefone(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    sufixos: string[],
  ) {
    const mapa = new Map<string, { id: string; razaoSocial: string }>();
    if (sufixos.length === 0) return mapa;

    const escopo = await resolverEscopoVendedores(tx, empresaId, user);
    // Escopo vazio não é "sem filtro": é "não vê carteira nenhuma".
    if (escopo !== null && escopo.length === 0) return mapa;

    const filtroCarteira =
      escopo === null
        ? Prisma.empty
        : Prisma.sql`AND c."vendedorId" IN (${Prisma.join(escopo)})`;

    const linhas = await tx.$queryRaw<
      { id: string; razaoSocial: string; sufixo: string }[]
    >(Prisma.sql`
      SELECT id, "razaoSocial", sufixo FROM (
        SELECT c.id,
               c."razaoSocial",
               t.sufixo,
               count(*) OVER (PARTITION BY t.sufixo) AS quantos
          FROM clientes c
          JOIN LATERAL (
            SELECT unnest(ARRAY[
              right(regexp_replace(coalesce(c.telefone,  ''), '\D', '', 'g'), 8),
              right(regexp_replace(coalesce(c.telefone2, ''), '\D', '', 'g'), 8),
              right(regexp_replace(coalesce(c.celular,   ''), '\D', '', 'g'), 8)
            ]) AS sufixo
          ) t ON true
         WHERE c."empresaId" = ${empresaId}
           AND c."deletedAt" IS NULL
           AND t.sufixo IN (${Prisma.join(sufixos)})
           ${filtroCarteira}
      ) x WHERE quantos = 1`);

    for (const linha of linhas) {
      mapa.set(linha.sufixo, { id: linha.id, razaoSocial: linha.razaoSocial });
    }
    return mapa;
  }

  private sufixo(telefone: string | null): string | null {
    if (!telefone) return null;
    const digitos = telefone.replace(/\D/g, '');
    return digitos.length >= 8 ? digitos.slice(-8) : null;
  }
}
