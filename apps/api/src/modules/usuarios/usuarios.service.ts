import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import { garantirVagaDeUsuario } from '../../common/empresa/limite-usuarios';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import { HorarioTrabalhoService } from '../acessos/horario-trabalho.service';
import {
  garantirPerfilDoGrupo as garantirPerfilDoGrupoDaEmpresa,
  grupoDaEmpresa,
} from '../../common/perfil/perfil-do-grupo';
import type {
  ResetPasswordInput,
  UsuarioCreate,
  UsuarioEmpresaCreate,
  UsuarioHorariosUpdate,
  UsuarioQuery,
  UsuarioUpdate,
} from '@plataforma/contracts';

const SALT_ROUNDS = 12;
const SORT_FIELDS = new Set(['nome', 'email', 'ativo', 'ultimoLogin', 'createdAt']);

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly politicaSenhaService: PoliticaSenhaService,
    private readonly horarioTrabalho: HorarioTrabalhoService,
  ) {}

  /**
   * "usuario_empresas" e "perfis" têm RLS: o filtro por relação
   * (`usuarioEmpresas: { some: { empresaId } }`) e o include de `perfil` só
   * enxergam linhas dentro do contexto de tenant — por isso roda tudo dentro
   * de `withTenant`, mesmo `usuario` em si não tendo RLS.
   */
  async findAll(empresaId: string, query: UsuarioQuery) {
    const where = {
      deletedAt: null,
      usuarioEmpresas: { some: { empresaId, ativo: true } },
      ...(query.perfilId ? { perfilId: query.perfilId } : {}),
      ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
      ...(query.search
        ? {
            OR: [
              { nome: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'nome';

    const [rows, total] = await this.prisma.withTenant(empresaId, (tx) =>
      Promise.all([
        tx.usuario.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true,
            ultimoLogin: true,
            avatarUrl: true,
            createdAt: true,
            updatedAt: true,
            createdBy: true,
            updatedBy: true,
            // Do usuário, iguais em todas as empresas do grupo. superiorId é
            // o id do usuário superior (até 30/09/2026 era o do vínculo dele).
            perfil: { select: { id: true, nome: true } },
            superiorId: true,
            codigoErp: true,
            nomeReduzido: true,
            telefone: true,
            celular: true,
            dataNascimento: true,
            usuarioEmpresas: {
              where: { empresaId, ativo: true },
              select: { id: true },
              take: 1,
            },
          },
        }),
        tx.usuario.count({ where }),
      ]),
    );

    const data = rows.map(({ usuarioEmpresas, ...usuario }) => ({
      ...usuario,
      // Id do acesso (usuarioEmpresa) a esta empresa, para quem ainda o usa.
      vinculoId: usuarioEmpresas[0]?.id ?? null,
    }));

    return buildPaginatedResult(data, total, query);
  }

  /**
   * `usuario_empresas` tem RLS: lido sem empresa definida (o `include` direto
   * que existia aqui), a policy filtra tudo e a tela mostrava "Nenhuma empresa
   * vinculada" para qualquer usuário. Os vínculos são lidos empresa a empresa,
   * no alcance de quem consulta: a empresa ativa e as demais do mesmo grupo
   * econômico. Vínculo em empresa fora desse alcance continua invisível.
   * Sem `empresaAtivaId` (uso interno, só conferir que existe), volta sem vínculos.
   */
  async findOne(id: string, empresaAtivaId?: string) {
    // Perfil e dados são do usuário. O perfil tem RLS por grupo: sem empresa
    // informada (uso interno), lê como o próprio usuário (withUsuario).
    const ler = (tx: TenantTx) =>
      tx.usuario.findFirst({
        where: { id, deletedAt: null },
        include: { perfil: true },
      });
    const usuario = empresaAtivaId
      ? await this.prisma.withTenant(empresaAtivaId, ler)
      : await this.prisma.withUsuario(id, ler);
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    const alcance = empresaAtivaId ? await this.empresasNoAlcance(empresaAtivaId) : [];
    const vinculos = (
      await Promise.all(
        alcance.map((empresaId) =>
          this.prisma.withTenant(empresaId, (tx) =>
            tx.usuarioEmpresa.findFirst({
              where: { usuarioId: id, empresaId, ativo: true },
              include: { empresa: true },
            }),
          ),
        ),
      )
    )
      .filter((v) => v !== null)
      // perfil/perfilId repetidos em cada acesso: é o mesmo em todos, e as
      // telas que liam por vínculo seguem funcionando.
      .map((v) => ({ ...v, perfilId: usuario.perfilId, perfil: usuario.perfil }));

    const { senhaHash: _senhaHash, ...safe } = usuario;
    return { ...safe, usuarioEmpresas: vinculos };
  }

  /** A empresa ativa e, se ela for de um grupo econômico, as demais do grupo. */
  private async empresasNoAlcance(empresaAtivaId: string) {
    const ativa = await this.prisma.empresa.findUnique({
      where: { id: empresaAtivaId },
      select: { grupoEconomicoId: true },
    });
    if (!ativa?.grupoEconomicoId) return [empresaAtivaId];
    const doGrupo = await this.prisma.empresa.findMany({
      where: { grupoEconomicoId: ativa.grupoEconomicoId, deletedAt: null },
      select: { id: true },
      orderBy: { nomeFantasia: 'asc' },
    });
    return doGrupo.map((e) => e.id);
  }

  /**
   * Recusa conceder OU retirar um perfil com `administraPlataforma` (hoje só
   * "Administrador da Plataforma") a quem não é, ele mesmo, administrador da
   * plataforma.
   *
   * Sem esta trava, `usuarios.editar` (que Administrador Empresa tem, via
   * `isAdmin`) bastaria para um admin de tenant se auto-promover a admin do
   * SaaS pelo vínculo — a tela de Perfis já é protegida por
   * `PlatformAdminGuard`, mas atribuir um `perfilId` existente a um vínculo é
   * outra rota, sem esse guard. `perfilIdAtual` cobre a retirada: alguém sem
   * a mesma autoridade não pode tirar o perfil de quem já tem, o que travaria
   * o dono da plataforma para fora do próprio tenant.
   *
   * Antes disso, para qualquer ator: o perfil novo tem de ser da plataforma
   * ou do grupo econômico da empresa (perfil tem dono, ver `perfil-do-grupo`).
   */
  private async garantirPodeAtribuirPerfil(
    perfilIdNovo: string,
    perfilIdAtual: string | null,
    atorEhAdminPlataforma: boolean,
    empresaId: string,
  ) {
    await garantirPerfilDoGrupoDaEmpresa(this.prisma, perfilIdNovo, empresaId);
    if (atorEhAdminPlataforma) return;
    const ids = [
      perfilIdNovo,
      ...(perfilIdAtual && perfilIdAtual !== perfilIdNovo ? [perfilIdAtual] : []),
    ];
    const restrito = await this.prisma.perfil.findFirst({
      where: { id: { in: ids }, administraPlataforma: true },
      select: { id: true },
    });
    if (restrito) {
      throw new ForbiddenException(
        'Apenas administradores da plataforma podem conceder ou retirar o perfil Administrador da Plataforma.',
      );
    }
  }

  /**
   * Cria o usuário e já vincula com a empresa ativa, com o perfil (RBAC)
   * informado. "usuario_empresas" tem RLS: precisa setar o tenant na mesma
   * transação, antes do create, pra passar no WITH CHECK do insert.
   */
  async create(
    input: UsuarioCreate,
    empresaId: string,
    actorId: string,
    atorEhAdminPlataforma: boolean,
  ) {
    await this.garantirPodeAtribuirPerfil(input.perfilId, null, atorEhAdminPlataforma, empresaId);

    // Modo sistema: o e-mail é único na base inteira, e a RLS de usuarios só
    // mostraria o grupo de quem cadastra.
    const existente = await this.prisma.withSistema((tx) =>
      tx.usuario.findUnique({ where: { email: input.email }, select: { id: true } }),
    );
    if (existente) throw new ConflictException('E-mail já cadastrado');

    await this.politicaSenhaService.validarSenhaDaEmpresa(
      empresaId,
      input.senha,
    );
    const senhaHash = await bcrypt.hash(input.senha, SALT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;
      // Dentro da transação de propósito: conferir a vaga fora dela deixaria
      // dois cadastros simultâneos passarem pelo mesmo último lugar.
      await garantirVagaDeUsuario(tx, empresaId);
      const usuario = await tx.usuario.create({
        data: {
          nome: input.nome,
          email: input.email,
          ativo: input.ativo,
          senhaHash,
          senhaAlteradaEm: new Date(),
          // Perfil e grupo são da conta; o vínculo é só o acesso à empresa.
          perfilId: input.perfilId,
          grupoEconomicoId: await grupoDaEmpresa(tx, empresaId),
          createdBy: actorId,
          updatedBy: actorId,
          usuarioEmpresas: {
            create: {
              empresaId,
              createdBy: actorId,
              updatedBy: actorId,
            },
          },
        },
        select: {
          id: true,
          nome: true,
          email: true,
          ativo: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Usuário criado para alguém que já é vendedor sai daqui vinculado: sem
      // isso o acesso nasce sem carteira nenhuma (o escopo hierárquico procura
      // o Vendedor pelo usuarioId) e alguém teria que lembrar de ligar os dois
      // na mão. O e-mail é a chave — é único nos dois cadastros. Vendedor que
      // já tem outro usuário não é tocado.
      await tx.vendedor.updateMany({
        where: {
          empresaId,
          email: input.email,
          usuarioId: null,
          deletedAt: null,
        },
        data: { usuarioId: usuario.id, updatedBy: actorId },
      });

      return usuario;
    });
  }

  async update(id: string, input: UsuarioUpdate, actorId: string) {
    await this.findOne(id);
    return this.prisma.usuario.update({
      where: { id },
      data: { ...input, updatedBy: actorId },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        updatedAt: true,
      },
    });
  }

  /** Reset de senha por admin — não exige a senha atual do usuário-alvo. */
  async resetSenha(id: string, input: ResetPasswordInput, actorId: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, deletedAt: null },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    await this.politicaSenhaService.validarSenhaDoUsuario(id, input.novaSenha);
    await this.politicaSenhaService.validarReuso(id, input.novaSenha, usuario.senhaHash);

    const novoHash = await bcrypt.hash(input.novaSenha, SALT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await this.politicaSenhaService.registrarHistorico(id, usuario.senhaHash, tx);
      await tx.usuario.update({
        where: { id },
        data: {
          senhaHash: novoHash,
          senhaAlteradaEm: new Date(),
          deveTrocarSenha: input.deveTrocarSenha,
          tentativasFalhas: 0,
          bloqueadoAte: null,
          updatedBy: actorId,
        },
      });
    });

    return { success: true };
  }

  async remove(id: string, actorId: string) {
    await this.findOne(id);
    await this.prisma.usuario.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorId, ativo: false },
    });
    return { success: true };
  }

  /**
   * Dá (ou confirma) o acesso do usuário a uma empresa e grava o perfil e os
   * dados dele — que são da conta, iguais em todas as empresas do grupo
   * (migration 20260930230000_dados_do_usuario). Mesma rota de antes, para as
   * telas não mudarem; o que mudou é onde grava.
   *
   * Uma conta é de um grupo só (decisão de 30/09/2026): acesso a empresa de
   * outro grupo é recusado, e o superior precisa ser usuário do mesmo grupo.
   */
  async vincularEmpresa(
    usuarioId: string,
    empresaId: string,
    input: UsuarioEmpresaCreate,
    actorId: string,
    atorEhAdminPlataforma: boolean,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const usuario = await tx.usuario.findFirst({
        where: { id: usuarioId, deletedAt: null },
        select: { perfilId: true, celular: true, grupoEconomicoId: true },
      });
      if (!usuario) throw new NotFoundException('Usuário não encontrado');
      const grupo = await grupoDaEmpresa(tx, empresaId);
      if (usuario.grupoEconomicoId && grupo && usuario.grupoEconomicoId !== grupo) {
        throw new ConflictException(
          'Esta conta pertence a outro grupo econômico. Uma conta dá acesso só às empresas do próprio grupo.',
        );
      }
      await this.garantirPodeAtribuirPerfil(
        input.perfilId,
        usuario.perfilId,
        atorEhAdminPlataforma,
        empresaId,
      );
      const superiorId = input.superiorId || null;
      if (superiorId) {
        if (superiorId === usuarioId) {
          throw new BadRequestException('O usuário não pode ser superior de si mesmo');
        }
        const superior = await tx.usuario.findFirst({
          where: { id: superiorId, deletedAt: null, grupoEconomicoId: grupo },
          select: { id: true },
        });
        if (!superior) throw new BadRequestException('Superior não encontrado neste grupo econômico');
      }

      // Só o acesso novo (ou reativado) consome vaga — daí o
      // `ignorarUsuarioId`, que tira a própria linha da contagem.
      const jaVinculado = await tx.usuarioEmpresa.findUnique({
        where: { usuarioId_empresaId: { usuarioId, empresaId } },
        select: { ativo: true },
      });
      if (!jaVinculado || !jaVinculado.ativo) {
        await garantirVagaDeUsuario(tx, empresaId, usuarioId);
      }

      const celular = input.celular || null;
      if (usuario.celular !== celular) {
        // Número novo desfaz o pareamento do WhatsApp confirmado com o antigo.
        await tx.whatsappVinculoFuncionario.deleteMany({ where: { usuarioId } });
      }
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          perfilId: input.perfilId,
          superiorId,
          codigoErp: input.codigoErp,
          nomeReduzido: input.nomeReduzido,
          telefone: input.telefone || null,
          celular,
          dataNascimento: input.dataNascimento,
          grupoEconomicoId: grupo,
          updatedBy: actorId,
        },
      });
      return tx.usuarioEmpresa.upsert({
        where: { usuarioId_empresaId: { usuarioId, empresaId } },
        create: { usuarioId, empresaId, createdBy: actorId, updatedBy: actorId },
        update: { ativo: true, deletedAt: null, deletedBy: null, updatedBy: actorId },
      });
    });
  }

  /** Expediente cadastrado do usuário (ver UsuarioHorario). */
  async obterHorarios(id: string) {
    await this.findOne(id);
    return this.horarioTrabalho.obter(id);
  }

  /**
   * Substitui o conjunto de faixas do usuário e liga/desliga a restrição.
   *
   * Troca em bloco (apaga e recria) em vez de diferenciar linha a linha: são
   * no máximo sete registros e o formulário sempre manda a semana inteira —
   * mesmo padrão dos itens de orçamento. Tudo numa transação, senão uma falha
   * no meio deixaria o usuário com meia semana cadastrada e restrição ligada,
   * o que o trancaria fora do sistema.
   */
  async salvarHorarios(
    id: string,
    input: UsuarioHorariosUpdate,
    actorId: string,
  ) {
    await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.usuarioHorario.deleteMany({ where: { usuarioId: id } });
      if (input.horarios.length > 0) {
        await tx.usuarioHorario.createMany({
          data: input.horarios.map((h) => ({
            usuarioId: id,
            diaSemana: h.diaSemana,
            horaInicio: h.horaInicio,
            horaFim: h.horaFim,
            createdBy: actorId,
            updatedBy: actorId,
          })),
        });
      }
      await tx.usuario.update({
        where: { id },
        data: { restringirHorario: input.restringirHorario, updatedBy: actorId },
      });
    });

    // O guard lê essa configuração de um cache de um minuto — sem isso, a
    // mudança só valeria no próximo ciclo, e quem acabou de ser liberado
    // continuaria barrado.
    this.horarioTrabalho.invalidar(id);
    return this.horarioTrabalho.obter(id);
  }

  /**
   * Tira o acesso do usuário a uma empresa. A `empresaId` vem da URL: só vale
   * a empresa ativa de quem pede e as demais do grupo dela. Antes, só a RLS
   * segurava uma empresa de fora (e a resposta era 500, não 404).
   */
  async desvincularEmpresa(
    usuarioId: string,
    empresaId: string,
    actorId: string,
    empresaAtivaId: string,
  ) {
    const alcance = await this.empresasNoAlcance(empresaAtivaId);
    if (!alcance.includes(empresaId)) throw new NotFoundException('Vínculo não encontrado');
    const { count } = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.updateMany({
        where: { usuarioId, empresaId },
        data: { ativo: false, updatedBy: actorId },
      }),
    );
    if (count === 0) throw new NotFoundException('Vínculo não encontrado');
    return { success: true };
  }
}
