import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { garantirVagaDeUsuario } from '../../common/empresa/limite-usuarios';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import { HorarioTrabalhoService } from '../acessos/horario-trabalho.service';
import { garantirPerfilDoGrupo as garantirPerfilDoGrupoDaEmpresa } from '../../common/perfil/perfil-do-grupo';
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
      usuarioEmpresas: {
        some: {
          empresaId,
          ativo: true,
          ...(query.perfilId ? { perfilId: query.perfilId } : {}),
        },
      },
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
            usuarioEmpresas: {
              where: { empresaId, ativo: true },
              select: {
                id: true,
                perfil: { select: { id: true, nome: true } },
                superiorId: true,
                codigoErp: true,
                nomeReduzido: true,
                telefone: true,
                celular: true,
                dataNascimento: true,
              },
              take: 1,
            },
          },
        }),
        tx.usuario.count({ where }),
      ]),
    );

    const data = rows.map(({ usuarioEmpresas, ...usuario }) => {
      const vinculo = usuarioEmpresas[0];
      return {
        ...usuario,
        // Id do vínculo (usuarioEmpresa) nesta empresa — é o que superiorId
        // de OUTRO vínculo referencia (hierarquia é por vínculo, não por
        // usuário, já que um usuário pode ter perfis diferentes por empresa).
        vinculoId: vinculo?.id ?? null,
        perfil: vinculo?.perfil ?? null,
        superiorId: vinculo?.superiorId ?? null,
        codigoErp: vinculo?.codigoErp ?? null,
        nomeReduzido: vinculo?.nomeReduzido ?? null,
        telefone: vinculo?.telefone ?? null,
        celular: vinculo?.celular ?? null,
        dataNascimento: vinculo?.dataNascimento ?? null,
      };
    });

    return buildPaginatedResult(data, total, query);
  }

  /**
   * "perfis" é global (sem RLS) — o withTenant abaixo é só reaproveitamento
   * do helper de transação por vínculo (mesmo padrão de AuthService.me),
   * não uma exigência de RLS sobre o perfil em si.
   */
  /**
   * `usuario_empresas` tem RLS: lido sem empresa definida (o `include` direto
   * que existia aqui), a policy filtra tudo e a tela mostrava "Nenhuma empresa
   * vinculada" para qualquer usuário. Os vínculos são lidos empresa a empresa,
   * no alcance de quem consulta: a empresa ativa e as demais do mesmo grupo
   * econômico. Vínculo em empresa fora desse alcance continua invisível.
   * Sem `empresaAtivaId` (uso interno, só conferir que existe), volta sem vínculos.
   */
  async findOne(id: string, empresaAtivaId?: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id, deletedAt: null },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    const alcance = empresaAtivaId ? await this.empresasNoAlcance(empresaAtivaId) : [];
    const vinculos = (
      await Promise.all(
        alcance.map((empresaId) =>
          this.prisma.withTenant(empresaId, (tx) =>
            tx.usuarioEmpresa.findFirst({
              where: { usuarioId: id, empresaId, ativo: true },
              include: { empresa: true, perfil: true },
            }),
          ),
        ),
      )
    ).filter((v) => v !== null);

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

    const existente = await this.prisma.usuario.findUnique({
      where: { email: input.email },
    });
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
          createdBy: actorId,
          updatedBy: actorId,
          usuarioEmpresas: {
            create: {
              empresaId,
              perfilId: input.perfilId,
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
   * O perfil do usuário é do grupo econômico, não da empresa (decisão de
   * 30/09/2026). Se a empresa é de um grupo e o usuário já tem acesso a outra
   * empresa dele com perfil diferente, esta rota — que muda uma empresa por
   * vez — deixaria os perfis divergentes. A troca vai pelo bloco "Empresas com
   * acesso", que aplica o perfil a todas (GruposEconomicosService.salvarUsuario).
   */
  private async garantirPerfilDoGrupo(usuarioId: string, empresaId: string, perfilId: string) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { grupoEconomicoId: true },
    });
    if (!empresa?.grupoEconomicoId) return;
    const irmas = await this.prisma.empresa.findMany({
      where: { grupoEconomicoId: empresa.grupoEconomicoId, id: { not: empresaId }, deletedAt: null },
      select: { id: true },
    });
    for (const irma of irmas) {
      const vinculo = await this.prisma.withTenant(irma.id, (tx) =>
        tx.usuarioEmpresa.findUnique({
          where: { usuarioId_empresaId: { usuarioId, empresaId: irma.id } },
          select: { ativo: true, perfilId: true },
        }),
      );
      if (vinculo?.ativo && vinculo.perfilId !== perfilId) {
        throw new BadRequestException(
          'O perfil do usuário é o mesmo em todas as empresas do grupo. Altere-o em "Perfil e empresas do usuário", no cadastro do usuário.',
        );
      }
    }
  }

  /**
   * Cria (ou edita, mesma rota) o vínculo do usuário com uma empresa —
   * perfil RBAC + hierarquia/dados de vendedor completos.
   */
  async vincularEmpresa(
    usuarioId: string,
    empresaId: string,
    input: UsuarioEmpresaCreate,
    actorId: string,
    atorEhAdminPlataforma: boolean,
  ) {
    await this.garantirPerfilDoGrupo(usuarioId, empresaId, input.perfilId);
    const vinculo = await this.prisma.withTenant(empresaId, async (tx) => {
      // Só o vínculo novo consome vaga; a edição de um que já existe, não —
      // daí o `ignorarUsuarioId`, que tira a própria linha da contagem.
      const jaVinculado = await tx.usuarioEmpresa.findUnique({
        where: { usuarioId_empresaId: { usuarioId, empresaId } },
        select: { ativo: true, perfilId: true, celular: true },
      });
      await this.garantirPodeAtribuirPerfil(
        input.perfilId,
        jaVinculado?.perfilId ?? null,
        atorEhAdminPlataforma,
        empresaId,
      );
      if (!jaVinculado || !jaVinculado.ativo) {
        await garantirVagaDeUsuario(tx, empresaId, usuarioId);
      }

      if (jaVinculado && jaVinculado.celular !== (input.celular || null)) {
        await tx.whatsappVinculoFuncionario.deleteMany({ where: { empresaId, usuarioId } });
      }
      return tx.usuarioEmpresa.upsert({
        where: { usuarioId_empresaId: { usuarioId, empresaId } },
        create: {
          usuarioId,
          empresaId,
          perfilId: input.perfilId,
          superiorId: input.superiorId,
          codigoErp: input.codigoErp,
          nomeReduzido: input.nomeReduzido,
          telefone: input.telefone || null,
          celular: input.celular || null,
          dataNascimento: input.dataNascimento,
          createdBy: actorId,
          updatedBy: actorId,
        },
        update: {
          perfilId: input.perfilId,
          superiorId: input.superiorId,
          codigoErp: input.codigoErp,
          nomeReduzido: input.nomeReduzido,
          telefone: input.telefone || null,
          celular: input.celular || null,
          dataNascimento: input.dataNascimento,
          ativo: true,
          updatedBy: actorId,
        },
      });
    });
    await this.sincronizarDadosNoGrupo(usuarioId, empresaId, input, actorId);
    return vinculo;
  }

  /**
   * O usuário é um só no grupo econômico, e os dados dele também (decisão de
   * 30/09/2026): superior, nome reduzido, código ERP, telefones e nascimento
   * valem para todas as empresas do grupo a que ele tem acesso. Eles moram
   * em cada vínculo (`usuario_empresas`, que o token e a hierarquia leem), então
   * gravar numa empresa replica nas demais do grupo.
   *
   * O superior é um vínculo **da empresa**: em cada empresa ele vira o vínculo
   * do mesmo superior ali; se o superior não tem acesso a ela, fica sem.
   */
  private async sincronizarDadosNoGrupo(
    usuarioId: string,
    empresaId: string,
    input: UsuarioEmpresaCreate,
    actorId: string,
  ) {
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { grupoEconomicoId: true },
    });
    if (!empresa) return;
    const irmas = await this.prisma.empresa.findMany({
      where: { grupoEconomicoId: empresa.grupoEconomicoId, id: { not: empresaId }, deletedAt: null },
      select: { id: true },
    });
    if (!irmas.length) return;
    const superiorUsuarioId = input.superiorId
      ? ((
          await this.prisma.withTenant(empresaId, (tx) =>
            tx.usuarioEmpresa.findUnique({ where: { id: input.superiorId! }, select: { usuarioId: true } }),
          )
        )?.usuarioId ?? null)
      : null;
    const celular = input.celular || null;
    for (const irma of irmas) {
      await this.prisma.withTenant(irma.id, async (tx) => {
        const atual = await tx.usuarioEmpresa.findUnique({
          where: { usuarioId_empresaId: { usuarioId, empresaId: irma.id } },
          select: { id: true, ativo: true, celular: true },
        });
        if (!atual?.ativo) return;
        const superior = superiorUsuarioId
          ? await tx.usuarioEmpresa.findUnique({
              where: { usuarioId_empresaId: { usuarioId: superiorUsuarioId, empresaId: irma.id } },
              select: { id: true, ativo: true },
            })
          : null;
        if (atual.celular !== celular) {
          await tx.whatsappVinculoFuncionario.deleteMany({ where: { empresaId: irma.id, usuarioId } });
        }
        await tx.usuarioEmpresa.update({
          where: { id: atual.id },
          data: {
            superiorId: superior?.ativo ? superior.id : null,
            codigoErp: input.codigoErp,
            nomeReduzido: input.nomeReduzido,
            telefone: input.telefone || null,
            celular,
            dataNascimento: input.dataNascimento,
            updatedBy: actorId,
          },
        });
      });
    }
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

  async desvincularEmpresa(usuarioId: string, empresaId: string, actorId: string) {
    await this.prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      data: { ativo: false, updatedBy: actorId },
    });
    return { success: true };
  }
}
