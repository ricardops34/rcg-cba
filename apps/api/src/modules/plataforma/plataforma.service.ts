import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import { podeAcessar } from '../../common/empresa/situacao-empresa';
import type {
  PlataformaAuditoriaQuery,
  PlataformaEmpresa,
  PlataformaEmpresaCreate,
  PlataformaEmpresaQuery,
  PlataformaSituacaoUpdate,
} from '@plataforma/contracts';
import type { Prisma } from '@prisma/client';

const SALT_ROUNDS = 12;

/** Quem está operando a administração da plataforma. */
type Ator = { id: string; email: string };

@Injectable()
export class PlataformaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava o log da ação. Recebe a transação para entrar junto com a mudança —
   * um log que pode faltar quando a escrita falha pela metade não serve para
   * auditar coisa nenhuma.
   */
  private registrar(
    tx: Prisma.TransactionClient,
    ator: Ator,
    dados: {
      acao: string;
      empresaId?: string | null;
      empresaRazaoSocial?: string | null;
      valorAnterior?: string | null;
      valorNovo?: string | null;
    },
  ) {
    return tx.plataformaAuditoria.create({
      data: {
        usuarioId: ator.id,
        usuarioEmail: ator.email,
        empresaId: dados.empresaId ?? null,
        empresaRazaoSocial: dados.empresaRazaoSocial ?? null,
        acao: dados.acao,
        valorAnterior: dados.valorAnterior ?? null,
        valorNovo: dados.valorNovo ?? null,
      },
    });
  }

  async listarEmpresas(query: PlataformaEmpresaQuery) {
    const agora = new Date();
    const where: Prisma.EmpresaWhereInput = {
      deletedAt: null,
      ...(query.situacao ? { situacao: query.situacao } : {}),
      ...(query.apenasExpiradas
        ? { situacao: 'teste' as const, testeExpiraEm: { lt: agora } }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                razaoSocial: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                nomeFantasia: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              { cnpj: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [linhas, total] = await Promise.all([
      this.prisma.empresa.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { [query.sortBy ?? 'razaoSocial']: query.sortOrder },
        select: {
          id: true,
          razaoSocial: true,
          nomeFantasia: true,
          cnpj: true,
          alias: true,
          situacao: true,
          testeExpiraEm: true,
          limiteUsuarios: true,
          createdAt: true,
          // Os vínculos ativos vêm na mesma consulta e servem a duas coisas:
          // o contador do limite e o último acesso. Um `_count` separado
          // pediria ao banco o que estas linhas já respondem.
          usuarioEmpresas: {
            where: { ativo: true },
            select: { usuario: { select: { ultimoLogin: true } } },
          },
        },
      }),
      this.prisma.empresa.count({ where }),
    ]);

    const data: PlataformaEmpresa[] = linhas.map((e) => {
      const ultimos = e.usuarioEmpresas
        .map((v) => v.usuario.ultimoLogin)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime());

      return {
        id: e.id,
        razaoSocial: e.razaoSocial,
        nomeFantasia: e.nomeFantasia,
        cnpj: e.cnpj,
        alias: e.alias,
        situacao: e.situacao,
        testeExpiraEm: e.testeExpiraEm?.toISOString() ?? null,
        limiteUsuarios: e.limiteUsuarios,
        usuariosAtivos: e.usuarioEmpresas.length,
        // Mesma comparação que decide o login, feita aqui e não na tela: duas
        // implementações discordariam no fuso do navegador.
        testeExpirado:
          e.situacao === 'teste' &&
          !podeAcessar(
            { situacao: e.situacao, testeExpiraEm: e.testeExpiraEm },
            agora,
          ),
        ultimoAcesso: ultimos[0]?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      };
    });

    return buildPaginatedResult(data, total, query);
  }

  /**
   * Cria a empresa e o primeiro administrador dela, numa transação só.
   *
   * Se o usuário falhar, a empresa não fica para trás — uma empresa sem
   * ninguém que consiga entrar é um cadastro inútil que alguém teria de
   * descobrir e consertar depois.
   */
  async criarEmpresa(input: PlataformaEmpresaCreate, ator: Ator) {
    const [cnpjEmUso, emailEmUso] = await Promise.all([
      this.prisma.empresa.findUnique({ where: { cnpj: input.cnpj } }),
      this.prisma.usuario.findUnique({ where: { email: input.admin.email } }),
    ]);
    if (cnpjEmUso) throw new ConflictException('CNPJ já cadastrado');
    if (emailEmUso) {
      throw new ConflictException(
        'Já existe usuário com este e-mail. Vincule-o à nova empresa em vez de criar outro.',
      );
    }
    if (input.alias) {
      const aliasEmUso = await this.prisma.empresa.findFirst({
        where: { alias: input.alias, deletedAt: null },
        select: { id: true },
      });
      if (aliasEmUso) throw new ConflictException('Alias já em uso');
    }

    const senhaHash = await bcrypt.hash(input.admin.senha, SALT_ROUNDS);

    return this.prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          razaoSocial: input.razaoSocial,
          nomeFantasia: input.nomeFantasia,
          cnpj: input.cnpj,
          alias: input.alias ?? null,
          situacao: input.situacao,
          testeExpiraEm: input.testeExpiraEm
            ? new Date(input.testeExpiraEm)
            : null,
          limiteUsuarios: input.limiteUsuarios ?? null,
          createdBy: ator.id,
          updatedBy: ator.id,
        },
      });

      // O perfil é global (compartilhado por todas as empresas), então o
      // Administrador que a empresa nova usa é o mesmo que já existe.
      const perfilAdmin = await tx.perfil.findFirst({
        where: { nome: 'Administrador', deletedAt: null },
        select: { id: true },
      });
      if (!perfilAdmin) {
        throw new NotFoundException(
          'Perfil Administrador não encontrado — rode o seed do catálogo antes de criar empresas.',
        );
      }

      // `usuario_empresas` tem RLS: o tenant precisa estar setado na mesma
      // transação para o insert passar no WITH CHECK.
      await tx.$executeRaw`SELECT set_config('app.current_empresa_id', ${empresa.id}, true)`;
      await tx.usuario.create({
        data: {
          nome: input.admin.nome,
          email: input.admin.email,
          senhaHash,
          senhaAlteradaEm: new Date(),
          // Provisória: quem recebe a senha por fora troca no primeiro acesso.
          deveTrocarSenha: true,
          createdBy: ator.id,
          updatedBy: ator.id,
          usuarioEmpresas: {
            create: {
              empresaId: empresa.id,
              perfilId: perfilAdmin.id,
              createdBy: ator.id,
              updatedBy: ator.id,
            },
          },
        },
      });

      await this.registrar(tx, ator, {
        acao: 'empresa.criada',
        empresaId: empresa.id,
        empresaRazaoSocial: empresa.razaoSocial,
        valorNovo: `situacao=${empresa.situacao}, admin=${input.admin.email}`,
      });

      return empresa;
    });
  }

  /** Muda situação, prazo de teste e/ou teto de usuários, registrando cada uma. */
  async alterarSituacao(
    empresaId: string,
    input: PlataformaSituacaoUpdate,
    ator: Ator,
  ) {
    const atual = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
      select: {
        id: true,
        razaoSocial: true,
        situacao: true,
        testeExpiraEm: true,
        limiteUsuarios: true,
      },
    });
    if (!atual) throw new NotFoundException('Empresa não encontrada');

    return this.prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.update({
        where: { id: empresaId },
        data: {
          ...(input.situacao !== undefined ? { situacao: input.situacao } : {}),
          ...(input.testeExpiraEm !== undefined
            ? {
                testeExpiraEm: input.testeExpiraEm
                  ? new Date(input.testeExpiraEm)
                  : null,
              }
            : {}),
          ...(input.limiteUsuarios !== undefined
            ? { limiteUsuarios: input.limiteUsuarios }
            : {}),
          updatedBy: ator.id,
        },
      });

      // Um registro por coisa mudada, não um só com tudo dentro: quem lê o log
      // procura "quando esta empresa foi suspensa", e uma linha genérica
      // obrigaria a abrir cada uma para descobrir.
      const comum = {
        empresaId: atual.id,
        empresaRazaoSocial: atual.razaoSocial,
      };
      const sufixo = input.motivo ? ` (${input.motivo})` : '';

      if (input.situacao !== undefined && input.situacao !== atual.situacao) {
        await this.registrar(tx, ator, {
          ...comum,
          acao: 'empresa.situacao_alterada',
          valorAnterior: atual.situacao,
          valorNovo: `${input.situacao}${sufixo}`,
        });
      }
      if (input.testeExpiraEm !== undefined) {
        await this.registrar(tx, ator, {
          ...comum,
          acao: 'empresa.teste_alterado',
          valorAnterior: atual.testeExpiraEm?.toISOString() ?? null,
          valorNovo: input.testeExpiraEm
            ? `${input.testeExpiraEm}${sufixo}`
            : `sem prazo${sufixo}`,
        });
      }
      if (input.limiteUsuarios !== undefined) {
        await this.registrar(tx, ator, {
          ...comum,
          acao: 'empresa.limite_alterado',
          valorAnterior: atual.limiteUsuarios?.toString() ?? 'sem limite',
          valorNovo: `${input.limiteUsuarios ?? 'sem limite'}${sufixo}`,
        });
      }

      return empresa;
    });
  }

  async listarAdmins() {
    const linhas = await this.prisma.usuario.findMany({
      where: { administradorPlataforma: true, deletedAt: null },
      select: {
        id: true,
        nome: true,
        email: true,
        ativo: true,
        ultimoLogin: true,
      },
      orderBy: { nome: 'asc' },
    });
    return linhas.map((u) => ({
      ...u,
      ultimoLogin: u.ultimoLogin?.toISOString() ?? null,
    }));
  }

  /**
   * Promove ou revoga um administrador da plataforma.
   *
   * Recusa revogar o último: sem nenhum administrador, o módulo fica
   * inacessível e a saída volta a ser um UPDATE manual no banco. E recusa
   * revogar a si mesmo — quem faz isso perde o acesso no clique seguinte, sem
   * ter como desfazer.
   */
  async definirAdmin(
    usuarioId: string,
    administradorPlataforma: boolean,
    ator: Ator,
  ) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, deletedAt: null },
      select: {
        id: true,
        nome: true,
        email: true,
        administradorPlataforma: true,
      },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    if (!administradorPlataforma) {
      if (usuario.id === ator.id) {
        throw new ConflictException(
          'Você não pode remover a si mesmo da administração da plataforma.',
        );
      }
      const total = await this.prisma.usuario.count({
        where: { administradorPlataforma: true, deletedAt: null, ativo: true },
      });
      if (total <= 1) {
        throw new ConflictException(
          'Este é o único administrador da plataforma. Promova outro antes de remover este.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.usuario.update({
        where: { id: usuarioId },
        data: { administradorPlataforma, updatedBy: ator.id },
        select: {
          id: true,
          nome: true,
          email: true,
          administradorPlataforma: true,
        },
      });
      await this.registrar(tx, ator, {
        acao: administradorPlataforma ? 'admin.promovido' : 'admin.revogado',
        valorNovo: usuario.email,
      });
      return atualizado;
    });
  }

  async listarAuditoria(query: PlataformaAuditoriaQuery) {
    const where: Prisma.PlataformaAuditoriaWhereInput = {
      ...(query.empresaId ? { empresaId: query.empresaId } : {}),
      ...(query.acao ? { acao: query.acao } : {}),
    };
    const [linhas, total] = await Promise.all([
      this.prisma.plataformaAuditoria.findMany({
        where,
        ...paginationToSkipTake(query),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.plataformaAuditoria.count({ where }),
    ]);
    return buildPaginatedResult(
      linhas.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
      total,
      query,
    );
  }
}
