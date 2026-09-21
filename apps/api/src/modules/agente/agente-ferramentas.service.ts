import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import { AgenteToolsService } from './agente-tools.service';
import { versaoEmUso, versoesDaFerramenta } from './agente-prompt-versoes';
import type { AgenteFerramentaUpdate } from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Configuração gravada de uma ferramenta. Nulo em nome/descrição = usa o código. */
export interface ConfigFerramenta {
  ativa: boolean;
  nome: string | null;
  descricao: string | null;
  instrucoes: string | null;
  perfilIds: string[];
}

/**
 * O que o laço de conversa precisa para filtrar o catálogo: a configuração da
 * empresa e o perfil de quem está perguntando.
 */
export interface FiltroFerramentas {
  config: Map<string, ConfigFerramenta>;
  perfilId: string | null;
  /**
   * O usuário tem WhatsApp pareado (uma sessão em nome do vendedor dele).
   *
   * Guarda das ferramentas marcadas `exigeWhatsapp`: sem aparelho vinculado
   * elas não são só inúteis, são confusas — o modelo prometeria agendar uma
   * mensagem ou reenviar um boleto por um WhatsApp que não existe. Quem não
   * tem cadastro de vendedor (financeiro, administrativo) também cai aqui.
   */
  whatsappVinculado: boolean;
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
      const versoes = versoesDaFerramenta(c.chave, c);
      const versao = versaoEmUso(versoes, linha?.versaoPrompt ?? null);

      return {
        chave: c.chave,
        ativa: linha?.ativa ?? true,
        nome: linha?.nome || c.nome,
        // A reescrita da empresa vence a versão; sem reescrita, vale o texto da
        // versão em uso. É por isso que a linha nasce vazia — ver `sincronizar`.
        descricao: linha?.descricao || versao.descricao,
        instrucoes: linha?.instrucoes || versao.instrucoes || '',
        // "Padrão" aqui é o da **versão em uso**, e não o da v1: é contra ele
        // que a tela compara para saber se houve reescrita, e é ele que o
        // "restaurar padrão" devolve.
        nomePadrao: c.nome,
        descricaoPadrao: versao.descricao,
        instrucoesPadrao: versao.instrucoes ?? '',
        versaoPrompt: linha?.versaoPrompt ?? null,
        versaoEmUso: versao.versao,
        versoes,
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

    await this.garantirTermosAceitos(empresaId, input);

    await this.prisma.withTenant(empresaId, async (tx) => {
      // O estado **antes** da gravação. É ele que a trilha guarda como
      // `valorAnterior`, e é o que permite desfazer e explicar uma mudança de
      // comportamento do assistente meses depois.
      const antes = await tx.agenteFerramenta.findUnique({
        where: { empresaId_chave: { empresaId, chave } },
        include: { perfis: { select: { perfilId: true } } },
      });

      const linha = await tx.agenteFerramenta.upsert({
        where: { empresaId_chave: { empresaId, chave } },
        create: { empresaId, chave, updatedBy: user.id },
        update: {
          ...(input.ativa !== undefined ? { ativa: input.ativa } : {}),
          // Texto vazio limpa a sobrescrita e devolve o padrão do código —
          // é como a tela oferece o "voltar ao original" sem um botão extra.
          ...(input.nome !== undefined ? { nome: input.nome || null } : {}),
          ...(input.instrucoes !== undefined
            ? { instrucoes: input.instrucoes || null }
            : {}),
          ...(input.descricao !== undefined
            ? { descricao: input.descricao || null }
            : {}),
          ...(input.versaoPrompt !== undefined
            ? { versaoPrompt: input.versaoPrompt || null }
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

      await this.registrarAuditoria(tx, empresaId, user, chave, antes, input);
    });

    return this.listar(empresaId);
  }

  /**
   * Guarda o antes e o depois de cada campo que **de fato** mudou.
   *
   * Só o que mudou: a tela grava campo a campo no `onBlur`, e registrar o
   * payload inteiro encheria a trilha de linhas em que nada mudou — que é como
   * uma trilha deixa de ser lida.
   *
   * Dentro da mesma transação da gravação, de propósito: uma alteração sem
   * rastro é pior do que uma alteração recusada.
   */
  private async registrarAuditoria(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    chave: string,
    antes: {
      ativa: boolean;
      nome: string | null;
      descricao: string | null;
      instrucoes: string | null;
      versaoPrompt: string | null;
      perfis: { perfilId: string }[];
    } | null,
    input: AgenteFerramentaUpdate,
  ) {
    const linhas: {
      campo: string;
      anterior: string | null;
      novo: string | null;
    }[] = [];

    const comparar = (
      campo: string,
      anterior: string | null,
      novo: string | null,
    ) => {
      if ((anterior ?? '') !== (novo ?? '')) {
        linhas.push({ campo, anterior, novo });
      }
    };

    if (input.ativa !== undefined) {
      comparar(
        'ativa',
        // Ferramenta sem linha nasce ativa (ver `sincronizar`); registrar
        // "de nada para true" esconderia que o estado anterior era ativo.
        antes ? String(antes.ativa) : 'true',
        String(input.ativa),
      );
    }
    if (input.nome !== undefined) {
      comparar('nome', antes?.nome ?? null, input.nome || null);
    }
    if (input.descricao !== undefined) {
      comparar('descricao', antes?.descricao ?? null, input.descricao || null);
    }
    if (input.instrucoes !== undefined) {
      comparar(
        'instrucoes',
        antes?.instrucoes ?? null,
        input.instrucoes || null,
      );
    }
    if (input.versaoPrompt !== undefined) {
      // Trocar de versão muda o que vai ao modelo tanto quanto reescrever o
      // texto — e some da tela assim que a próxima versão sair. Sem a trilha,
      // "por que ele responde diferente" ficaria sem resposta.
      comparar(
        'versaoPrompt',
        antes?.versaoPrompt ?? null,
        input.versaoPrompt || null,
      );
    }
    if (input.perfilIds) {
      const ordenar = (ids: string[]) => [...ids].sort().join(',');
      comparar(
        'perfis',
        antes ? ordenar(antes.perfis.map((p) => p.perfilId)) : '',
        ordenar(input.perfilIds),
      );
    }

    if (linhas.length === 0) return;

    await tx.agenteFerramentaAuditoria.createMany({
      data: linhas.map((l) => ({
        empresaId,
        chave,
        campo: l.campo,
        valorAnterior: l.anterior,
        valorNovo: l.novo,
        autorId: user.id,
        autorEmail: user.email,
      })),
    });
  }

  /** Configuração + perfil do usuário, para o filtro do laço de conversa. */
  async filtroPara(
    empresaId: string,
    user: AuthenticatedUser,
  ): Promise<FiltroFerramentas> {
    const { linhas, vinculo, sessaoWhatsapp } = await this.prisma.withTenant(
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
        // O aparelho pareado deste usuário. Basta a sessão existir: se estiver
        // desconectada no momento, o envio falha com a mensagem que manda
        // conectar pela tela de Atendimento — melhor do que sumir com a
        // ferramenta e deixar o vendedor sem entender por quê.
        sessaoWhatsapp: await tx.whatsappSessao.findFirst({
          where: {
            empresaId,
            vendedor: { usuarioId: user.id, empresaId, deletedAt: null },
          },
          select: { id: true },
        }),
      }),
    );

    return {
      // O que vai ao modelo já sai **resolvido**: reescrita da empresa, ou o
      // texto da versão em uso. Resolver aqui, e não no laço da conversa, é o
      // que garante que a tela e o prompt mostrem o mesmo texto — foi o que
      // levou `listar` e `filtroPara` a compartilharem `versaoEmUso`.
      config: new Map(
        linhas.map((l) => {
          const doCatalogo = this.tools
            .catalogo()
            .find((c) => c.chave === l.chave);
          const versao = doCatalogo
            ? versaoEmUso(
                versoesDaFerramenta(l.chave, doCatalogo),
                l.versaoPrompt,
              )
            : null;
          return [
            l.chave,
            {
              ativa: l.ativa,
              nome: l.nome,
              descricao: l.descricao || versao?.descricao || null,
              instrucoes: l.instrucoes || versao?.instrucoes || null,
              perfilIds: l.perfis.map((p) => p.perfilId),
            },
          ] as const;
        }),
      ),
      perfilId: vinculo?.perfilId ?? null,
      whatsappVinculado: !!sessaoWhatsapp,
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
  /**
   * O que o agente consegue fazer **para quem está perguntando**.
   *
   * É a mesma lista que vai para o modelo (permissão do usuário ∩ configuração
   * da empresa), e é essa a graça: a página de ajuda não pode prometer uma
   * capacidade que o vendedor não tem, nem esconder uma que ele tem. Devolve a
   * descrição já com a reescrita da empresa, porque é o vocabulário que a
   * equipe usa.
   */
  async disponiveisParaAjuda(empresaId: string, user: AuthenticatedUser) {
    const filtro = await this.filtroPara(empresaId, user);
    return this.tools.disponiveisPara(user, filtro).map((f) => {
      const cfg = filtro.config.get(f.nome);
      return {
        chave: f.nome,
        nome: cfg?.nome || f.nome,
        descricao: cfg?.descricao || f.descricao,
        escrita: !!f.escrita,
        exemplos: f.exemplos ?? [],
      };
    });
  }

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

    // A linha nasce **vazia**, e é assim que tem de ser desde que existem
    // versões de prompt.
    //
    // Nulo em `descricao`/`instrucoes` significa "segue a versão do sistema".
    // Gravar uma cópia do texto no momento da criação congelaria a empresa na
    // versão daquele dia — e a escolha de versão, que é o ponto, nunca valeria.
    //
    // A tela continua mostrando o texto em uso: `listar` resolve a versão e
    // devolve o texto efetivo, então o campo aparece preenchido do mesmo jeito.
    await tx.agenteFerramenta.createMany({
      data: faltando.map((chave) => ({ empresaId, chave })),
      skipDuplicates: true,
    });
  }

  /**
   * Devolve os textos de uma ferramenta ao padrão do código.
   *
   * Apaga a cópia gravada em vez de reescrevê-la com o texto atual: a linha
   * volta a **seguir** o código, e melhoria futura no padrão passa a valer de
   * novo. Reescrever com o texto de hoje deixaria a cópia congelada outra vez.
   */
  async restaurarPadrao(
    empresaId: string,
    user: AuthenticatedUser,
    chave: string,
  ) {
    const doCatalogo = this.tools.catalogo().find((c) => c.chave === chave);
    if (!doCatalogo) {
      throw new NotFoundException(`Ferramenta "${chave}" não existe`);
    }

    await this.prisma.withTenant(empresaId, async (tx) => {
      const antes = await tx.agenteFerramenta.findUnique({
        where: { empresaId_chave: { empresaId, chave } },
        include: { perfis: { select: { perfilId: true } } },
      });
      if (!antes) return;

      await tx.agenteFerramenta.update({
        where: { id: antes.id },
        data: {
          nome: null,
          descricao: null,
          instrucoes: null,
          updatedBy: user.id,
        },
      });

      // Restaurar é uma alteração como outra qualquer, e entra na trilha pelo
      // mesmo caminho: sem isso, "voltou ao padrão" seria a única mudança de
      // comportamento sem rastro.
      await this.registrarAuditoria(tx, empresaId, user, chave, antes, {
        nome: '',
        descricao: '',
        instrucoes: '',
      });
    });

    return this.listar(empresaId);
  }

  /**
   * Devolve **todas** as ferramentas ao texto do sistema, de uma vez.
   *
   * Restaurar uma a uma, em 26, é onde se desiste no meio — e meia
   * restauração é pior que nenhuma: fica um catálogo em que parte fala com a
   * voz da empresa e parte com a do sistema, sem nada na tela dizendo qual é
   * qual.
   *
   * Numa transação só, pelo mesmo motivo: uma falha na décima deixaria
   * exatamente esse estado misto, e quem clicou não teria como saber onde
   * parou.
   *
   * **Só texto.** Não mexe em ligado/desligado, em perfis nem na versão
   * escolhida — desligar uma ferramenta é outra decisão, tomada em outro lugar
   * da tela, e quem pede "voltar os textos ao padrão" não está pedindo para
   * religar o que alguém desligou de propósito.
   */
  async restaurarTodosPadrao(empresaId: string, user: AuthenticatedUser) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      // Só o que tem reescrita. Passar por cima das demais não seria só
      // desperdício: `updatedBy` passaria a apontar para quem não alterou
      // nada, e a tela mostra esse nome como autor da última mudança.
      const comReescrita = await tx.agenteFerramenta.findMany({
        where: {
          empresaId,
          OR: [
            { nome: { not: null } },
            { descricao: { not: null } },
            { instrucoes: { not: null } },
          ],
        },
        include: { perfis: { select: { perfilId: true } } },
      });

      for (const antes of comReescrita) {
        await tx.agenteFerramenta.update({
          where: { id: antes.id },
          data: {
            nome: null,
            descricao: null,
            instrucoes: null,
            updatedBy: user.id,
          },
        });

        // A mesma trilha do restauro individual, uma linha por campo que de
        // fato mudou — quem faz esse corte é `registrarAuditoria`.
        await this.registrarAuditoria(tx, empresaId, user, antes.chave, antes, {
          nome: '',
          descricao: '',
          instrucoes: '',
        });
      }
    });

    return this.listar(empresaId);
  }

  /** A trilha, para a tela mostrar o que mudou e quem mudou. */
  async auditoria(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteFerramentaAuditoria.findMany({
        where: { empresaId },
        orderBy: { criadoEm: 'desc' },
        take: 100,
        select: {
          chave: true,
          campo: true,
          valorAnterior: true,
          valorNovo: true,
          autorEmail: true,
          criadoEm: true,
        },
      }),
    );
  }

  /**
   * Os textos de uma versão específica, para a pré-visualização e o teste.
   *
   * Devolve `null` quando a versão não existe — quem chama ignora e segue com
   * o que está gravado, em vez de mandar prompt vazio ao modelo.
   */
  textoDaVersao(chave: string, versao: string) {
    const doCatalogo = this.tools.catalogo().find((c) => c.chave === chave);
    if (!doCatalogo) return null;
    return (
      versoesDaFerramenta(chave, doCatalogo).find((v) => v.versao === versao) ??
      null
    );
  }

  /** Quem aceitou os termos e quando. Nulo = ninguém aceitou. */
  async situacaoTermos(empresaId: string) {
    const config = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConfig.findUnique({
        where: { empresaId },
        select: { termosPromptAceitosEm: true, termosPromptAceitosPor: true },
      }),
    );
    return {
      aceitoEm: config?.termosPromptAceitosEm?.toISOString() ?? null,
      aceitoPor: config?.termosPromptAceitosPor ?? null,
    };
  }

  /**
   * Registra o aceite dos termos de edição de prompt.
   *
   * Sem ele, a API recusa a edição dos textos — ver `garantirTermosAceitos`.
   */
  async aceitarTermos(empresaId: string, user: AuthenticatedUser) {
    await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConfig.upsert({
        where: { empresaId },
        create: {
          empresaId,
          termosPromptAceitosEm: new Date(),
          termosPromptAceitosPor: user.email,
          createdBy: user.id,
          updatedBy: user.id,
        },
        update: {
          termosPromptAceitosEm: new Date(),
          termosPromptAceitosPor: user.email,
          updatedBy: user.id,
        },
      }),
    );
    return { aceitoEm: new Date().toISOString(), aceitoPor: user.email };
  }

  /**
   * Editar **texto** exige o aceite; ligar/desligar e escolher perfis, não.
   *
   * A distinção é o que separa configuração de redação: desligar uma
   * ferramenta é uma decisão reversível e visível na própria tela; reescrever
   * o prompt muda como o assistente fala com cliente, e o efeito só aparece
   * numa conversa, depois.
   */
  private async garantirTermosAceitos(
    empresaId: string,
    input: AgenteFerramentaUpdate,
  ) {
    const mexeEmTexto =
      input.nome !== undefined ||
      input.descricao !== undefined ||
      input.instrucoes !== undefined;
    if (!mexeEmTexto) return;

    const config = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteConfig.findUnique({
        where: { empresaId },
        select: { termosPromptAceitosEm: true },
      }),
    );
    if (!config?.termosPromptAceitosEm) {
      throw new ForbiddenException(
        'Aceite os termos de edição de prompt antes de alterar os textos das ferramentas.',
      );
    }
  }
}
