import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  extensaoPorMime,
  whatsappPublicPath,
  WHATSAPP_DIR,
} from '../../common/uploads/uploads.config';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { WhatsappSessaoService } from './whatsapp-sessao.service';
import { WhatsappWorkerClient } from './whatsapp-worker.client';
import {
  combinarFiltroVendedor,
  resolverEscopoVendedores,
} from '../../common/escopo/escopo-vendedores';
import type {
  WhatsappConversaQuery,
  WhatsappEnviar,
  WhatsappIniciarConversa,
  WhatsappMensagemQuery,
  WhatsappVincular,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

const PREVIA_TAMANHO = 120;

/** Tipos cuja mensagem carrega arquivo a baixar. */
const MIDIA = ['imagem', 'video', 'audio', 'documento'];

/**
 * Conversas e mensagens do atendimento.
 *
 * O corte de acesso é sempre pela **sessão**: uma conversa pertence à sessão de
 * um vendedor, e quem pode lê-la é quem `WhatsappSessaoService.escopoLeitura`
 * autoriza. Nenhuma consulta aqui parte do `clienteId` — se partisse, um
 * vendedor com o cliente na carteira leria a conversa que **outro** vendedor
 * teve com esse mesmo cliente.
 */
@Injectable()
export class WhatsappConversasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsappConfigService,
    private readonly sessoes: WhatsappSessaoService,
    private readonly worker: WhatsappWorkerClient,
  ) {}

  /** Filtro de sessão a partir do escopo de leitura. `[]` = não vê nada. */
  private async filtroSessao(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    vendedorIdQuery?: string,
  ) {
    const escopo = await this.sessoes.escopoLeitura(tx, empresaId, user);
    if (escopo === null) {
      return vendedorIdQuery
        ? { sessao: { vendedorId: vendedorIdQuery } }
        : {};
    }
    const permitidos = vendedorIdQuery
      ? escopo.includes(vendedorIdQuery)
        ? [vendedorIdQuery]
        : []
      : escopo;
    return { sessao: { vendedorId: { in: permitidos } } };
  }

  async listar(
    empresaId: string,
    user: AuthenticatedUser,
    query: WhatsappConversaQuery,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const filtro = await this.filtroSessao(
        tx,
        empresaId,
        user,
        query.vendedorId,
      );

      const where = {
        ...filtro,
        arquivada: query.arquivadas,
        ...(query.semVinculo ? { clienteId: null } : {}),
        ...(query.busca
          ? {
              OR: [
                {
                  contato: {
                    nomeExibicao: {
                      contains: query.busca,
                      mode: 'insensitive' as const,
                    },
                  },
                },
                { contato: { telefoneNormalizado: { contains: query.busca } } },
                {
                  cliente: {
                    razaoSocial: {
                      contains: query.busca,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              ],
            }
          : {}),
      };

      const [total, linhas] = await Promise.all([
        tx.whatsappConversa.count({ where }),
        tx.whatsappConversa.findMany({
          where,
          include: {
            contato: true,
            cliente: { select: { razaoSocial: true, codigoErp: true } },
            sessao: {
              select: { vendedorId: true, vendedor: { select: { nome: true } } },
            },
            // Só a última mensagem, para a prévia da lista — trazer o rolo
            // inteiro de cada conversa aqui derrubaria a tela.
            mensagens: {
              orderBy: { criadaEm: 'desc' },
              take: 1,
              select: { conteudo: true, tipo: true },
            },
          },
          orderBy: [{ ultimaMensagemEm: 'desc' }, { updatedAt: 'desc' }],
          skip: (query.pagina - 1) * query.tamanho,
          take: query.tamanho,
        }),
      ]);

      return {
        total,
        pagina: query.pagina,
        tamanho: query.tamanho,
        itens: linhas.map((c) => ({
          id: c.id,
          empresaId: c.empresaId,
          sessaoId: c.sessaoId,
          contato: {
            id: c.contato.id,
            jid: c.contato.jid,
            nomeExibicao: c.contato.nomeExibicao,
            telefoneNormalizado: c.contato.telefoneNormalizado,
            clienteId: c.contato.clienteId,
            clienteRazaoSocial: c.cliente?.razaoSocial ?? null,
            clienteCodigoErp: c.cliente?.codigoErp ?? null,
            ignorado: c.contato.ignorado,
          },
          clienteId: c.clienteId,
          ultimaMensagemEm: c.ultimaMensagemEm,
          ultimaMensagemPrevia: this.previa(c.mensagens[0]),
          naoLidas: c.naoLidas,
          arquivada: c.arquivada,
          vendedorId: c.sessao.vendedorId,
          vendedorNome: c.sessao.vendedor.nome,
        })),
      };
    });
  }

  private previa(ultima?: { conteudo: string | null; tipo: string }) {
    if (!ultima) return null;
    if (ultima.tipo !== 'texto') return `[${ultima.tipo}]`;
    const texto = (ultima.conteudo ?? '').replace(/\s+/g, ' ').trim();
    return texto.length > PREVIA_TAMANHO
      ? `${texto.slice(0, PREVIA_TAMANHO)}…`
      : texto;
  }

  /** Carrega a conversa garantindo que o usuário pode lê-la. 404 fora do escopo. */
  private async conversaNoEscopo(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const filtro = await this.filtroSessao(tx, empresaId, user);
    const conversa = await tx.whatsappConversa.findFirst({
      where: { id: conversaId, ...filtro },
      include: {
        contato: true,
        sessao: { select: { id: true, vendedorId: true, status: true } },
      },
    });
    // 404 e não 403: fora do escopo, a conversa não deve nem revelar que existe.
    if (!conversa) throw new NotFoundException('Conversa não encontrada');
    return conversa;
  }

  async mensagens(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    query: WhatsappMensagemQuery,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      await this.conversaNoEscopo(tx, empresaId, user, conversaId);

      const linhas = await tx.whatsappMensagem.findMany({
        where: {
          conversaId,
          ...(query.antesDe ? { criadaEm: { lt: new Date(query.antesDe) } } : {}),
        },
        orderBy: { criadaEm: 'desc' },
        take: query.tamanho,
      });
      // Devolve em ordem cronológica: a paginação é para trás, a leitura é para
      // frente.
      return linhas.reverse();
    });
  }

  /**
   * Envia mensagem pela sessão da conversa.
   *
   * A mensagem só é gravada depois que o worker confirma o envio — gravar antes
   * deixaria no histórico do vendedor uma mensagem que o cliente nunca recebeu.
   */
  async enviar(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappEnviar,
  ) {
    const config = await this.config.obter(empresaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(
        tx,
        empresaId,
        user,
        conversaId,
      );

      // Supervisor lê, mas não fala pelo aparelho do subordinado: quem envia é
      // o dono da sessão.
      await this.garantirDono(tx, empresaId, user, conversa);

      const enviada = await this.worker.chamar<{ externoId: string }>(
        config.workerUrl,
        `/sessoes/${conversa.sessaoId}/mensagens`,
        {
          metodo: 'POST',
          corpo: {
            jid: conversa.contato.jid,
            texto: input.texto,
            respondeuA: input.respondeuA ?? null,
          },
        },
      );

      const mensagem = await tx.whatsappMensagem.create({
        data: {
          empresaId,
          conversaId,
          externoId: enviada.externoId,
          direcao: 'saida',
          tipo: 'texto',
          conteudo: input.texto,
          respondeuA: input.respondeuA ?? null,
          enviadaPor: user.id,
          statusEntrega: 'enviada',
        },
      });

      await tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { ultimaMensagemEm: mensagem.criadaEm },
      });

      return mensagem;
    });
  }

  /**
   * Envia um arquivo já salvo em disco pelo upload.
   *
   * A gravação da mensagem acontece **depois** da confirmação do provedor,
   * como no texto: um anexo que o cliente nunca recebeu não pode aparecer no
   * histórico como enviado.
   */
  async enviarArquivo(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    arquivo: { caminhoDisco: string; nome: string; mime: string; tamanho: number },
    input: { legenda?: string; ptt?: boolean },
  ) {
    const config = await this.config.obter(empresaId);
    const conteudo = await readFile(arquivo.caminhoDisco);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(tx, empresaId, user, conversaId);
      await this.garantirDono(tx, empresaId, user, conversa);

      const tipo = this.tipoPorMime(arquivo.mime);
      const enviada = await this.worker.chamar<{ externoId: string }>(
        config.workerUrl,
        `/sessoes/${conversa.sessaoId}/arquivos`,
        {
          metodo: 'POST',
          corpo: {
            jid: conversa.contato.jid,
            tipo,
            nome: arquivo.nome,
            mime: arquivo.mime,
            legenda: input.legenda ?? null,
            ptt: input.ptt ?? false,
            conteudoBase64: conteudo.toString('base64'),
          },
        },
      );

      const mensagem = await tx.whatsappMensagem.create({
        data: {
          empresaId,
          conversaId,
          externoId: enviada.externoId,
          direcao: 'saida',
          tipo,
          conteudo: input.legenda ?? null,
          arquivoUrl: whatsappPublicPath(basename(arquivo.caminhoDisco)),
          arquivoNome: arquivo.nome,
          enviadaPor: user.id,
          statusEntrega: 'enviada',
        },
      });

      await tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { ultimaMensagemEm: mensagem.criadaEm },
      });

      return mensagem;
    });
  }

  /**
   * Grava o arquivo de uma mensagem recebida — segundo passo do recebimento.
   *
   * O worker só chega aqui quando a API confirmou que a mensagem foi gravada;
   * mídia de conversa não vinculada a cliente nunca é baixada.
   */
  async gravarArquivoRecebido(entrada: {
    empresaId: string;
    sessaoId: string;
    externoId: string;
    nome: string | null;
    mime: string | null;
    conteudoBase64: string;
  }) {
    const conteudo = Buffer.from(entrada.conteudoBase64, 'base64');
    const mime = entrada.mime ?? 'application/octet-stream';
    // Nome opaco em disco; o nome que o cliente deu fica só na coluna.
    const arquivo = `${randomUUID()}${extensaoPorMime(mime)}`;

    await mkdir(WHATSAPP_DIR, { recursive: true });
    await writeFile(join(WHATSAPP_DIR, arquivo), conteudo);

    return this.prisma.withTenant(entrada.empresaId, async (tx) => {
      const mensagem = await tx.whatsappMensagem.findFirst({
        where: { externoId: entrada.externoId },
        select: { id: true },
      });
      if (!mensagem) return { gravado: false };

      await tx.whatsappMensagem.update({
        where: { id: mensagem.id },
        data: {
          arquivoUrl: whatsappPublicPath(arquivo),
          arquivoNome: entrada.nome,
        },
      });
      return { gravado: true };
    });
  }

  /** Só o dono da sessão fala pelo aparelho — o supervisor lê, não responde. */
  private async garantirDono(
    tx: TenantTx,
    empresaId: string,
    user: AuthenticatedUser,
    conversa: { sessao: { vendedorId: string; status: string } },
  ) {
    const vendedor = await tx.vendedor.findFirst({
      where: { usuarioId: user.id, empresaId, deletedAt: null },
      select: { id: true },
    });
    if (!vendedor || vendedor.id !== conversa.sessao.vendedorId) {
      throw new ForbiddenException(
        'Só o vendedor dono da sessão pode responder por ela.',
      );
    }
    if (conversa.sessao.status !== 'conectada') {
      throw new BadRequestException(
        'O WhatsApp não está conectado. Conecte o aparelho pelo botão da tela de Atendimento.',
      );
    }
  }

  /** O WhatsApp mostra a mídia conforme o tipo, não conforme a extensão. */
  private tipoPorMime(mime: string): 'imagem' | 'video' | 'audio' | 'documento' {
    if (mime.startsWith('image/')) return 'imagem';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'documento';
  }

  /**
   * Vincula (ou desvincula) o contato a um cliente.
   *
   * É o vínculo que **autoriza a gravação** da conversa — por isso o cliente
   * precisa estar na carteira de quem vincula, senão bastaria apontar para
   * qualquer cliente para começar a gravar.
   *
   * Gravação retroativa não acontece: o que passou antes do vínculo não existe
   * e não é recuperado.
   */
  async vincular(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
    input: WhatsappVincular,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(
        tx,
        empresaId,
        user,
        conversaId,
      );

      if (input.clienteId) {
        const escopo = await resolverEscopoVendedores(tx, empresaId, user);
        const cliente = await tx.cliente.findFirst({
          where: {
            id: input.clienteId,
            deletedAt: null,
            ...combinarFiltroVendedor(escopo),
          },
          select: { id: true },
        });
        if (!cliente) {
          throw new NotFoundException(
            'Cliente não encontrado na sua carteira.',
          );
        }
      }

      await tx.whatsappContato.update({
        where: { id: conversa.contatoId },
        data: {
          clienteId: input.clienteId,
          ignorado: input.ignorar,
          vinculadoPor: user.id,
          vinculadoEm: input.clienteId ? new Date() : null,
        },
      });

      return tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { clienteId: input.clienteId },
      });
    });
  }

  /**
   * Abre (ou reabre) a conversa com um contato — o "começar conversa" da tela.
   *
   * Sem isto o vendedor só conseguia responder quem escrevesse primeiro, que
   * é o oposto de como ele trabalha: o cliente está na agenda dele há anos.
   *
   * Aceita dois caminhos, e nenhum dos dois cria conversa às cegas:
   * - **por cliente da carteira**, usando o telefone do cadastro;
   * - **por jid da agenda**, para contato que ainda não é cliente.
   *
   * Note que abrir conversa **não** grava mensagem nenhuma: continua valendo
   * que só conversa de contato vinculado a cliente é registrada.
   */
  async iniciarConversa(
    empresaId: string,
    user: AuthenticatedUser,
    input: WhatsappIniciarConversa,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({
        where: { usuarioId: user.id, empresaId, deletedAt: null },
        select: { id: true },
      });
      if (!vendedor) {
        throw new BadRequestException(
          'Seu usuário não está vinculado a um cadastro de vendedor.',
        );
      }

      const sessao = await tx.whatsappSessao.findUnique({
        where: { empresaId_vendedorId: { empresaId, vendedorId: vendedor.id } },
        select: { id: true, status: true },
      });
      if (!sessao || sessao.status !== 'conectada') {
        throw new BadRequestException(
          'Seu WhatsApp não está conectado. Conecte o aparelho para iniciar uma conversa.',
        );
      }

      let jid = input.jid ?? null;
      let telefone = input.telefone ? input.telefone.replace(/\D/g, '') : null;
      let clienteId = input.clienteId ?? null;
      let nome = input.nome ?? null;

      if (clienteId) {
        const escopo = await resolverEscopoVendedores(tx, empresaId, user);
        const cliente = await tx.cliente.findFirst({
          where: {
            id: clienteId,
            deletedAt: null,
            ...combinarFiltroVendedor(escopo),
          },
          select: {
            razaoSocial: true,
            celular: true,
            telefone: true,
            telefone2: true,
          },
        });
        if (!cliente) {
          throw new NotFoundException('Cliente não encontrado na sua carteira.');
        }
        nome = nome ?? cliente.razaoSocial;
        // Celular primeiro: é o que costuma ter WhatsApp.
        telefone =
          telefone ??
          this.primeiroTelefoneValido([
            cliente.celular,
            cliente.telefone,
            cliente.telefone2,
          ]);
        if (!telefone) {
          throw new BadRequestException(
            `${cliente.razaoSocial} não tem telefone no cadastro. Informe o número para iniciar a conversa.`,
          );
        }
      }

      if (!jid) {
        if (!telefone) {
          throw new BadRequestException('Informe o cliente ou o número.');
        }
        jid = `${await this.numeroCompleto(empresaId, telefone)}@s.whatsapp.net`;
      }

      const contato = await tx.whatsappContato.upsert({
        where: { empresaId_jid: { empresaId, jid } },
        create: {
          empresaId,
          jid,
          nomeExibicao: nome,
          telefoneNormalizado: telefone,
          clienteId,
          ...(clienteId ? { vinculadoPor: user.id, vinculadoEm: new Date() } : {}),
        },
        update: {
          // Vínculo existente não é sobrescrito por um "iniciar conversa":
          // desvincular é decisão explícita, feita na tela de vínculo.
          ...(clienteId ? { clienteId, vinculadoPor: user.id, vinculadoEm: new Date() } : {}),
          ...(nome ? { nomeExibicao: nome } : {}),
          ...(telefone ? { telefoneNormalizado: telefone } : {}),
        },
      });

      const conversa = await tx.whatsappConversa.upsert({
        where: {
          empresaId_sessaoId_contatoId: {
            empresaId,
            sessaoId: sessao.id,
            contatoId: contato.id,
          },
        },
        create: {
          empresaId,
          sessaoId: sessao.id,
          contatoId: contato.id,
          clienteId: contato.clienteId,
        },
        // Reabrir uma conversa arquivada é justamente o que o vendedor quer
        // ao procurá-la de novo.
        update: { clienteId: contato.clienteId, arquivada: false },
      });

      return conversa;
    });
  }

  private primeiroTelefoneValido(candidatos: (string | null)[]): string | null {
    for (const bruto of candidatos) {
      const digitos = (bruto ?? '').replace(/\D/g, '');
      // 8 dígitos é o mínimo de um número local — nesta base a maioria dos
      // telefones está gravada sem DDD (ver `numeroCompleto`).
      if (digitos.length >= 8) return digitos;
    }
    return null;
  }

  /**
   * Monta o número no formato que o provedor exige (DDI + DDD + número).
   *
   * O ponto delicado: **a maioria dos telefones desta base está sem DDD**
   * (8 ou 9 dígitos). Completar por dedução — pelo estado do cliente, pela
   * cidade da empresa — manda mensagem para um desconhecido em outro DDD.
   * Por isso o DDD padrão é configuração explícita da empresa, e sem ela o
   * sistema recusa em vez de chutar.
   */
  private async numeroCompleto(empresaId: string, telefone: string) {
    const digitos = telefone.replace(/\D/g, '');
    // Já veio com DDI (55 + DDD + 8/9 dígitos).
    if (digitos.length >= 12) return digitos;
    // DDD presente, DDI ausente.
    if (digitos.length >= 10) return `55${digitos}`;

    const config = await this.config.obter(empresaId);
    if (!config.dddPadrao) {
      throw new BadRequestException(
        `O telefone ${telefone} está cadastrado sem DDD, e não há DDD padrão ` +
          'configurado em Administração > WhatsApp. Informe o número completo ' +
          'com DDD para iniciar a conversa.',
      );
    }
    return `55${config.dddPadrao}${digitos}`;
  }

  /**
   * Zera o contador de não lidas — a tela chama ao abrir a conversa.
   *
   * Também manda o recibo de leitura pelo provedor: sem isso a conversa
   * continua marcada como não lida no celular do vendedor, e ele acaba
   * respondendo duas vezes a mesma mensagem.
   */
  async marcarLida(
    empresaId: string,
    user: AuthenticatedUser,
    conversaId: string,
  ) {
    const config = await this.config.obter(empresaId);

    return this.prisma.withTenant(empresaId, async (tx) => {
      const conversa = await this.conversaNoEscopo(tx, empresaId, user, conversaId);

      const ultima = await tx.whatsappMensagem.findFirst({
        where: { conversaId, direcao: 'entrada' },
        orderBy: { criadaEm: 'desc' },
        select: { externoId: true },
      });

      if (ultima && conversa.sessao.status === 'conectada') {
        // Cortesia com o cliente, não pode derrubar a abertura da conversa.
        await this.worker
          .chamar(config.workerUrl, `/sessoes/${conversa.sessaoId}/lida`, {
            metodo: 'POST',
            corpo: { jid: conversa.contato.jid, externoId: ultima.externoId },
          })
          .catch(() => undefined);
      }

      return tx.whatsappConversa.update({
        where: { id: conversaId },
        data: { naoLidas: 0 },
      });
    });
  }

  /**
   * Recebe uma mensagem vinda do worker.
   *
   * **Aqui mora a regra de privacidade do módulo:** só se persiste conversa de
   * contato ligado a um cliente. Se o vendedor parear um número que também usa
   * na vida pessoal, o sistema estaria gravando a conversa dele com a família.
   *
   * Contato sem cliente gera apenas o registro mínimo de "existe uma conversa
   * não vinculada" — o texto **não** é gravado. Se o vendedor vincular depois,
   * a gravação começa dali em diante: **retroativo nunca acontece**, porque o
   * que não foi gravado não existe para ser recuperado.
   */
  async receber(entrada: {
    sessaoId: string;
    empresaId: string;
    externoId: string;
    jid: string;
    telefone?: string | null;
    nomeExibicao: string | null;
    texto: string | null;
    tipo: string;
    arquivoNome?: string | null;
    arquivoMime?: string | null;
    respondeuA?: string | null;
  }) {
    const { empresaId } = entrada;

    return this.prisma.withTenant(empresaId, async (tx) => {
      const sessao = await tx.whatsappSessao.findFirst({
        where: { id: entrada.sessaoId },
        select: { id: true, vendedorId: true },
      });
      if (!sessao) return { gravada: false, motivo: 'sessao-desconhecida' };

      // O jid nem sempre contém o número: no formato novo do WhatsApp
      // (`253368761077916@lid`) ele é um identificador opaco, e extrair
      // dígitos dali produziria um "telefone" que nunca casa com cliente
      // nenhum. O telefone de verdade vem resolvido pelo worker.
      const telefone =
        (entrada.telefone ?? '').replace(/\D/g, '') ||
        (entrada.jid.includes('@lid')
          ? ''
          : entrada.jid.split(/[:@]/)[0].replace(/\D/g, ''));

      // Mesmo contato pode chegar com dois jids diferentes (o formato novo
      // `@lid` e o clássico `@s.whatsapp.net`). Procurar pelo telefone antes
      // de criar é o que evita duas conversas com a mesma pessoa — e o
      // vínculo com cliente que ficaria só em uma delas.
      const existente = telefone
        ? await tx.whatsappContato.findFirst({
            where: { telefoneNormalizado: telefone },
            select: { id: true, jid: true },
          })
        : null;

      const contato = existente
        ? await tx.whatsappContato.update({
            where: { id: existente.id },
            data: { nomeExibicao: entrada.nomeExibicao ?? undefined },
          })
        : await tx.whatsappContato.upsert({
            where: { empresaId_jid: { empresaId, jid: entrada.jid } },
            create: {
              empresaId,
              jid: entrada.jid,
              nomeExibicao: entrada.nomeExibicao,
              telefoneNormalizado: telefone || null,
              // Casamento automático pelo telefone, restrito à carteira do
              // vendedor dono da sessão. Ambiguidade não adivinha: dois
              // clientes com o mesmo telefone deixam o vínculo em branco.
              clienteId: await this.casarCliente(
                tx,
                empresaId,
                sessao.vendedorId,
                telefone,
              ),
            },
            update: {
              nomeExibicao: entrada.nomeExibicao ?? undefined,
              ...(telefone ? { telefoneNormalizado: telefone } : {}),
            },
          });

      const conversa = await tx.whatsappConversa.upsert({
        where: {
          empresaId_sessaoId_contatoId: {
            empresaId,
            sessaoId: sessao.id,
            contatoId: contato.id,
          },
        },
        create: {
          empresaId,
          sessaoId: sessao.id,
          contatoId: contato.id,
          clienteId: contato.clienteId,
          ultimaMensagemEm: new Date(),
          naoLidas: 1,
        },
        update: {
          clienteId: contato.clienteId,
          ultimaMensagemEm: new Date(),
          naoLidas: { increment: 1 },
        },
      });

      if (!contato.clienteId) {
        // A conversa existe para o vendedor poder vinculá-la; o conteúdo, não.
        return { gravada: false, motivo: 'sem-vinculo', conversaId: conversa.id };
      }

      const mensagem = await tx.whatsappMensagem.upsert({
        // Idempotência da reconexão: o provedor reenvia o que já entregou.
        where: {
          empresaId_conversaId_externoId: {
            empresaId,
            conversaId: conversa.id,
            externoId: entrada.externoId,
          },
        },
        create: {
          empresaId,
          conversaId: conversa.id,
          externoId: entrada.externoId,
          direcao: 'entrada',
          tipo: (entrada.tipo as 'texto') ?? 'texto',
          conteudo: entrada.texto,
          arquivoNome: entrada.arquivoNome ?? null,
          respondeuA: entrada.respondeuA ?? null,
          statusEntrega: 'entregue',
        },
        update: {},
        select: { id: true, arquivoUrl: true },
      });

      return {
        gravada: true,
        conversaId: conversa.id,
        // Pedir o arquivo é um segundo passo: só depois de decidir que a
        // mensagem fica é que faz sentido baixar a mídia dela. Reenvio de
        // mensagem já baixada não pede de novo.
        arquivoNecessario:
          MIDIA.includes(entrada.tipo) && !mensagem.arquivoUrl,
      };
    });
  }

  /** null quando não há candidato **ou** quando há mais de um (não adivinha). */
  private async casarCliente(
    tx: TenantTx,
    empresaId: string,
    vendedorId: string,
    telefone: string,
  ): Promise<string | null> {
    if (telefone.length < 8) return null;
    // Compara pelos últimos 8 dígitos: cobre com/sem DDI 55 e com/sem o 9º
    // dígito sem precisar normalizar a base inteira.
    const sufixo = telefone.slice(-8);
    const candidatos = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM clientes
      WHERE "empresaId" = ${empresaId}
        AND "vendedorId" = ${vendedorId}
        AND "deletedAt" IS NULL
        AND (
          right(regexp_replace(coalesce(telefone,  ''), '\D', '', 'g'), 8) = ${sufixo} OR
          right(regexp_replace(coalesce(telefone2, ''), '\D', '', 'g'), 8) = ${sufixo} OR
          right(regexp_replace(coalesce(celular,   ''), '\D', '', 'g'), 8) = ${sufixo}
        )
      LIMIT 2`;
    return candidatos.length === 1 ? candidatos[0].id : null;
  }

  /**
   * Sessões a reabrir quando o worker sobe.
   *
   * Percorre empresa a empresa porque `whatsapp_sessoes` tem RLS: uma consulta
   * sem tenant no contexto volta vazia, por desenho.
   *
   * Só as `conectada`: quem estava em `pareando` não chegou a ler o QR, e
   * reabrir essa sessão faria o worker manter um socket aberto gerando QR que
   * ninguém está olhando.
   */
  async sessoesParaRestaurar() {
    const empresas = await this.prisma.empresa.findMany({
      where: { ativo: true, deletedAt: null },
      select: { id: true },
    });

    const restaurar: { sessaoId: string; empresaId: string }[] = [];
    for (const empresa of empresas) {
      const sessoes = await this.prisma.withTenant(empresa.id, (tx) =>
        tx.whatsappSessao.findMany({
          where: { status: 'conectada' },
          select: { id: true },
        }),
      );
      for (const s of sessoes) {
        restaurar.push({ sessaoId: s.id, empresaId: empresa.id });
      }
    }
    return restaurar;
  }

  /** Total de não lidas do usuário — alimenta o sino de notificações. */
  async totalNaoLidas(empresaId: string, user: AuthenticatedUser) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const filtro = await this.filtroSessao(tx, empresaId, user);
      const linhas = await tx.whatsappConversa.findMany({
        where: { ...filtro, naoLidas: { gt: 0 }, arquivada: false },
        select: {
          id: true,
          naoLidas: true,
          ultimaMensagemEm: true,
          contato: { select: { nomeExibicao: true, telefoneNormalizado: true } },
          cliente: { select: { razaoSocial: true } },
        },
        orderBy: { ultimaMensagemEm: 'desc' },
        take: 10,
      });
      return {
        total: linhas.reduce((soma, l) => soma + l.naoLidas, 0),
        conversas: linhas,
      };
    });
  }
}
