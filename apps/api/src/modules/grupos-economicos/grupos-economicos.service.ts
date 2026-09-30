import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { liberarModoSistema, PrismaService, type TenantTx } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { GrupoEconomicoInput, GrupoUsuarioInput, GrupoUsuario } from '@plataforma/contracts';
import { garantirVagaDeUsuario } from '../../common/empresa/limite-usuarios';
import { garantirVagaDeEmpresa } from '../../common/empresa/limite-empresas';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import { aplicarPerfisNoGrupo, garantirPerfilDoGrupo, planejarPerfisParaGrupo, type PlanoDePerfis } from '../../common/perfil/perfil-do-grupo';

const empresaSelect = { id: true, nomeFantasia: true, cnpj: true, grupoEconomicoId: true } as const;

@Injectable()
export class GruposEconomicosService {
  constructor(private readonly prisma: PrismaService, private readonly senhas: PoliticaSenhaService) {}

  private exigirAdmin(user: AuthenticatedUser) {
    if (!user.isAdmin) throw new ForbiddenException('Somente administradores podem gerenciar o grupo econômico');
  }

  private async grupoDoAdmin(user: AuthenticatedUser) {
    this.exigirAdmin(user);
    const usuario = await this.prisma.usuario.findUnique({ where: { id: user.id }, select: { grupoEconomicoId: true } });
    return usuario?.grupoEconomicoId ?? null;
  }

  private async empresasAdministradas(user: AuthenticatedUser) {
    this.exigirAdmin(user);
    if (user.administradorPlataforma) return null;
    const links = await this.prisma.withUsuario(user.id, (tx) => tx.usuarioEmpresa.findMany({
      where: { usuarioId: user.id, ativo: true, deletedAt: null,
        usuario: { perfil: { sistemaBase: true, deletedAt: null } }, empresa: { deletedAt: null } },
      select: { empresaId: true },
    }));
    return links.map((v) => v.empresaId);
  }

  async contexto(user: AuthenticatedUser) {
    const ids = await this.empresasAdministradas(user);
    const grupoId = await this.grupoDoAdmin(user);
    const grupos = await this.prisma.grupoEconomico.findMany({
      where: { deletedAt: null, ...(ids === null ? {} : { id: grupoId ?? '' }) },
      select: { id: true, descricao: true, assinatura: { select: { situacao: true, plano: { select: { nome: true, limiteEmpresas: true } } } }, empresas: { where: { deletedAt: null }, select: empresaSelect, orderBy: { nomeFantasia: 'asc' } } },
      orderBy: { descricao: 'asc' },
    });
    // Toda empresa tem grupo: "disponível" é empresa de **outro** grupo, que
    // pode ser movida para este. O admin de empresa só vê as que administra.
    const empresasDisponiveis = await this.prisma.empresa.findMany({
      where: {
        deletedAt: null,
        ...(grupoId && ids !== null ? { grupoEconomicoId: { not: grupoId } } : {}),
        ...(ids === null ? {} : { id: { in: ids } }),
      },
      select: empresaSelect, orderBy: { nomeFantasia: 'asc' },
    });
    return { grupos, empresasDisponiveis, podeCriarGrupo: ids === null };
  }

  private async grupo(id: string, user: AuthenticatedUser) {
    this.exigirAdmin(user);
    if (!user.administradorPlataforma && await this.grupoDoAdmin(user) !== id) throw new NotFoundException('Grupo econômico não encontrado');
    const grupo = await this.prisma.grupoEconomico.findFirst({
      where: { id, deletedAt: null },
      include: { empresas: { where: { deletedAt: null }, select: empresaSelect } },
    });
    if (!grupo) throw new NotFoundException('Grupo econômico não encontrado');
    return grupo;
  }

  // Hierarquia: Grupo econômico → Empresa. Criar o grupo é da administração da
  // plataforma. Editar a descrição e incluir/excluir empresas também é do
  // administrador de uma empresa do grupo (`grupo()` confere que ele pertence
  // a este grupo) — mas só inclui empresa que ele mesmo administra, senão um
  // cliente puxaria a empresa de outro para o grupo dele.
  async salvar(id: string | null, input: GrupoEconomicoInput, user: AuthenticatedUser) {
    if (!id && !user.administradorPlataforma) {
      throw new ForbiddenException('O grupo econômico é criado pela administração da plataforma');
    }
    const anterior = id ? await this.grupo(id, user) : null;
    const diretas = await this.empresasAdministradas(user);
    const atuais = new Set(anterior?.empresas.map((e) => e.id));
    for (const empresaId of input.empresaIds) {
      if (!atuais.has(empresaId) && diretas !== null && !diretas.includes(empresaId)) {
        throw new ForbiddenException('Para incluir uma empresa, você precisa ser administrador dela');
      }
    }
    // Serializa alterações de composição; uma empresa não pode pertencer a dois grupos.
    return this.prisma.$transaction(async (tx) => {
      // Modo sistema: recompor o grupo mexe em mais de um grupo (a empresa sai
      // de um e entra em outro, a excluída ganha grupo próprio, o de origem
      // vazio é desativado), e a RLS por grupo só enxergaria o da empresa
      // ativa. Quem pode fazer o quê já foi conferido acima: grupo() e
      // empresasAdministradas().
      await liberarModoSistema(tx);
      if (id) await tx.$queryRaw`SELECT id FROM grupos_economicos WHERE id = ${id} FOR UPDATE`;
      if (id && !user.administradorPlataforma && input.empresaIds.some((empresaId) => !atuais.has(empresaId))) {
        await garantirVagaDeEmpresa(tx, id, input.empresaIds.length);
      }
      const todas = [...new Set([...atuais, ...input.empresaIds])].sort();
      for (const empresaId of todas) {
        await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      }
      const empresas = await tx.empresa.findMany({ where: { id: { in: input.empresaIds }, deletedAt: null }, select: empresaSelect });
      if (empresas.length !== input.empresaIds.length) throw new BadRequestException('Empresa não encontrada');
      const grupo = id
        ? await tx.grupoEconomico.update({ where: { id }, data: { descricao: input.descricao, updatedBy: user.id } })
        : await tx.grupoEconomico.create({ data: { descricao: input.descricao, createdBy: user.id, updatedBy: user.id } });
      // Toda empresa tem grupo (decisão de 30/09/2026), então incluir uma
      // empresa é **movê-la** do grupo em que está. Os usuários com vínculo
      // **ativo** nela vêm junto, sem duplicar conta nem alterar senha. Vínculo
      // inativo não conta: é histórico, não pertença. Usuário que já está num
      // terceiro grupo (nem o de origem da empresa, nem este) exige revisão.
      const origens = new Set<string>();
      // Perfil é do grupo: a empresa que chega traz para cá os perfis do grupo
      // antigo que usa (ou passa a usar o daqui de mesmo nome). Planejado aqui,
      // com a empresa ainda no grupo antigo, e aplicado depois da mudança — a
      // RLS de perfis só mostra o grupo atual da empresa.
      const planos = new Map<string, PlanoDePerfis>();
      for (const empresa of empresas) {
        if (empresa.grupoEconomicoId && empresa.grupoEconomicoId !== grupo.id) origens.add(empresa.grupoEconomicoId);
        await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresa.id}, true)`;
        if (empresa.grupoEconomicoId !== grupo.id) planos.set(empresa.id, await planejarPerfisParaGrupo(tx, empresa.id, grupo.id));
        const links = await tx.usuarioEmpresa.findMany({ where: { empresaId: empresa.id, ativo: true, deletedAt: null }, select: { usuarioId: true } });
        for (const link of links) {
          const aceitos = [grupo.id, ...(empresa.grupoEconomicoId ? [empresa.grupoEconomicoId] : [])];
          const vinculado = await tx.usuario.updateMany({ where: { id: link.usuarioId, OR: [{ grupoEconomicoId: null }, { grupoEconomicoId: { in: aceitos } }] }, data: { grupoEconomicoId: grupo.id, updatedBy: user.id } });
          if (vinculado.count !== 1) throw new ConflictException('Uma empresa possui usuário vinculado a outro grupo. Revise os vínculos antes de agrupá-la.');
        }
      }
      // Empresa excluída deste grupo não pode ficar sem grupo: ganha um grupo
      // próprio, com o nome dela. Os vínculos dos usuários são preservados.
      const excluidas = await tx.empresa.findMany({ where: { grupoEconomicoId: grupo.id, id: { notIn: input.empresaIds } }, select: { id: true, nomeFantasia: true } });
      for (const e of excluidas) {
        const proprio = await tx.grupoEconomico.create({ data: { descricao: e.nomeFantasia, createdBy: user.id, updatedBy: user.id } });
        await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${e.id}, true)`;
        const plano = await planejarPerfisParaGrupo(tx, e.id, proprio.id);
        await tx.empresa.update({ where: { id: e.id }, data: {
          grupoEconomicoId: proprio.id, updatedBy: user.id,
          situacao: 'suspensa', testeExpiraEm: null,
        } });
        await aplicarPerfisNoGrupo(tx, e.id, proprio.id, plano, user.id);
      }
      await tx.empresa.updateMany({ where: { id: { in: input.empresaIds } }, data: { grupoEconomicoId: grupo.id, updatedBy: user.id } });
      for (const [empresaId, plano] of planos) {
        await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresaId}, true)`;
        await aplicarPerfisNoGrupo(tx, empresaId, grupo.id, plano, user.id);
      }
      // O grupo de onde a empresa saiu, se ficou vazio, é desativado.
      for (const origem of origens) {
        const restantes = await tx.empresa.count({ where: { grupoEconomicoId: origem, deletedAt: null } });
        if (restantes === 0) await tx.grupoEconomico.update({ where: { id: origem }, data: { deletedAt: new Date(), updatedBy: user.id } });
      }
      return { id: grupo.id, descricao: grupo.descricao };
    }, { timeout: 20_000 });
  }

  async usuarios(id: string, user: AuthenticatedUser): Promise<GrupoUsuario[]> {
    const grupo = await this.grupo(id, user);
    const resultado = new Map<string, GrupoUsuario>();
    const contas = await this.prisma.usuario.findMany({ where: { grupoEconomicoId: id, deletedAt: null }, select: { id: true, nome: true, email: true } });
    for (const conta of contas) resultado.set(conta.id, { ...conta, vinculos: [] });
    for (const empresa of grupo.empresas) {
      const links = await this.prisma.withTenant(empresa.id, (tx) => tx.usuarioEmpresa.findMany({
        where: { empresaId: empresa.id, deletedAt: null, usuario: { deletedAt: null, grupoEconomicoId: id } },
        select: { empresaId: true, ativo: true, usuario: { select: { id: true, nome: true, email: true, perfilId: true } } },
      }));
      // perfilId em cada acesso: é o do usuário, o mesmo em todos (o contrato
      // de GrupoUsuario continua por vínculo).
      for (const { usuario: { perfilId, ...usuario }, ...vinculo } of links) {
        const item = resultado.get(usuario.id) ?? { ...usuario, vinculos: [] };
        item.vinculos.push({ ...vinculo, perfilId });
        resultado.set(usuario.id, item);
      }
    }
    return [...resultado.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async salvarUsuario(id: string, input: GrupoUsuarioInput, user: AuthenticatedUser) {
    const grupo = await this.grupo(id, user);
    const ids = new Set(grupo.empresas.map((e) => e.id));
    if (input.vinculos.some((v) => !ids.has(v.empresaId))) throw new ForbiddenException('Empresa fora do grupo');
    // O perfil é do usuário no grupo, não por empresa (decisão de 30/09/2026):
    // um só perfil para todas as empresas do grupo a que ele tem acesso.
    const perfilDoGrupo = input.vinculos[0].perfilId;
    if (input.vinculos.some((v) => v.perfilId !== perfilDoGrupo)) {
      throw new BadRequestException('O perfil do usuário é o mesmo em todas as empresas do grupo');
    }
    if (input.usuarioId && !(await this.usuarios(id, user)).some((u) => u.id === input.usuarioId)) {
      throw new NotFoundException('Usuário não encontrado no grupo');
    }
    if (input.novo) {
      // Modo sistema: o e-mail é único na base inteira, não só no grupo.
      if (await this.prisma.withSistema((tx) => tx.usuario.findUnique({ where: { email: input.novo!.email }, select: { id: true } }))) {
        throw new ConflictException('E-mail já cadastrado. Selecione o usuário existente do grupo; contas externas precisam de vinculação autorizada.');
      }
      for (const v of input.vinculos) await this.senhas.validarSenhaDaEmpresa(v.empresaId, input.novo.senha);
    }
    const senhaHash = input.novo ? await bcrypt.hash(input.novo.senha, 12) : null;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grupos_economicos WHERE id = ${id} FOR UPDATE`;
      const primeira = [...input.vinculos].sort((a, b) => a.empresaId.localeCompare(b.empresaId))[0];
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${primeira.empresaId}, true)`;
      const anterior = input.usuarioId
        ? await tx.usuario.findFirst({ where: { id: input.usuarioId, grupoEconomicoId: id, deletedAt: null }, select: { perfilId: true } })
        : null;
      if (input.usuarioId && !anterior) throw new ForbiddenException('Usuário fora do grupo econômico');
      // O perfil é da conta (migration 20260930230000_dados_do_usuario): grava
      // uma vez, e vale em todas as empresas do grupo.
      await this.validarPerfil(tx, perfilDoGrupo, anterior?.perfilId, user, primeira.empresaId);
      const usuario = input.novo
        ? await tx.usuario.create({ data: {
            grupoEconomicoId: id, perfilId: perfilDoGrupo,
            nome: input.novo.nome, email: input.novo.email, senhaHash: senhaHash!, ativo: true,
            deveTrocarSenha: true, senhaAlteradaEm: new Date(), createdBy: user.id, updatedBy: user.id,
          }, select: { id: true } })
        : await tx.usuario.update({
            where: { id: input.usuarioId! },
            data: { perfilId: perfilDoGrupo, updatedBy: user.id },
            select: { id: true },
          });
      for (const v of [...input.vinculos].sort((a, b) => a.empresaId.localeCompare(b.empresaId))) {
        await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${v.empresaId} FOR UPDATE`;
        const empresa = await tx.empresa.findFirst({ where: { id: v.empresaId, grupoEconomicoId: id, deletedAt: null } });
        if (!empresa) throw new ForbiddenException('A empresa não pertence mais ao grupo');
        await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${v.empresaId}, true)`;
        const atual = await tx.usuarioEmpresa.findUnique({ where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: v.empresaId } } });
        if (!atual?.ativo) await garantirVagaDeUsuario(tx, v.empresaId, usuario.id);
        // Só o acesso: perfil e dados já são da conta.
        await tx.usuarioEmpresa.upsert({
          where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: v.empresaId } },
          create: { usuarioId: usuario.id, empresaId: v.empresaId, createdBy: user.id, updatedBy: user.id },
          update: { ativo: true, deletedAt: null, deletedBy: null, updatedBy: user.id },
        });
        if (input.novo) await tx.vendedor.updateMany({ where: { empresaId: v.empresaId, email: input.novo.email, usuarioId: null, deletedAt: null }, data: { usuarioId: usuario.id, updatedBy: user.id } });
      }
      return usuario;
    }, { timeout: 20_000 });
  }

  /** `empresaId` presente = atribuição: o perfil tem de ser da plataforma ou do grupo da empresa. */
  private async validarPerfil(tx: TenantTx, perfilId: string, anterior: string | undefined, user: AuthenticatedUser, empresaId?: string) {
    const perfil = await tx.perfil.findFirst({ where: { id: perfilId, deletedAt: null } });
    if (!perfil) throw new BadRequestException('Perfil não encontrado');
    if (empresaId) await garantirPerfilDoGrupo(tx, perfilId, empresaId);
    if (user.administradorPlataforma) return;
    const restrito = await tx.perfil.findFirst({ where: { id: { in: [perfilId, ...(anterior ? [anterior] : [])] }, administraPlataforma: true } });
    if (restrito) throw new ForbiddenException('Somente a plataforma pode alterar o perfil Administrador da Plataforma');
  }

  async removerAcesso(id: string, usuarioId: string, empresaId: string, user: AuthenticatedUser) {
    const grupo = await this.grupo(id, user);
    if (!grupo.empresas.some((e) => e.id === empresaId)) throw new ForbiddenException('Empresa fora do grupo');
    if (usuarioId === user.id) throw new BadRequestException('Não remova seu próprio acesso por esta tela');
    return this.prisma.withTenant(empresaId, async (tx) => {
      const atual = await tx.usuarioEmpresa.findUnique({
        where: { usuarioId_empresaId: { usuarioId, empresaId } },
        include: { usuario: { select: { perfilId: true } } },
      });
      if (!atual) throw new NotFoundException('Vínculo não encontrado');
      await this.validarPerfil(tx, atual.usuario.perfilId, atual.usuario.perfilId, user);
      await tx.usuarioEmpresa.update({ where: { id: atual.id }, data: { ativo: false, updatedBy: user.id } });
      await tx.whatsappVinculoFuncionario.deleteMany({ where: { usuarioId, empresaId } });
      return { success: true };
    });
  }
}
