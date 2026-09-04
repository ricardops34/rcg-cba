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
import { garantirVagaDeUsuario } from '../../common/empresa/limite-usuarios';
import type {
  PlataformaAuditoriaQuery,
  PlataformaEmpresa,
  PlataformaEmpresaAdmin,
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
        },
      }),
      this.prisma.empresa.count({ where }),
    ]);

    // Uma consulta por empresa, e **não** um include na consulta acima.
    //
    // `usuario_empresas` tem RLS: fora de `withTenant` a policy compara
    // `empresaId` com um `app.current_empresa_id` vazio, não bate em nada e
    // devolve zero linhas — sem erro. Foi o que aconteceu na primeira versão
    // disto: a tela mostrava "0 usuários" para uma empresa com dez, e o tipo
    // do campo estava certo, então só apareceu ao rodar contra uma base com
    // dados de verdade.
    //
    // O N+1 é consciente: são tantas consultas quanto a página tem linhas
    // (20 por padrão), curtas e indexadas, numa tela de administração usada
    // por poucas pessoas. Um número errado sai mais caro do que 20 queries.
    const usoPorEmpresa = new Map<
      string,
      { usuariosAtivos: number; ultimoAcesso: Date | null }
    >();
    await Promise.all(
      linhas.map((e) =>
        this.prisma.withTenant(e.id, async (tx) => {
          const vinculos = await tx.usuarioEmpresa.findMany({
            where: { empresaId: e.id, ativo: true },
            select: { usuario: { select: { ultimoLogin: true } } },
          });
          const ultimos = vinculos
            .map((v) => v.usuario.ultimoLogin)
            .filter((d): d is Date => d !== null)
            .sort((a, b) => b.getTime() - a.getTime());
          usoPorEmpresa.set(e.id, {
            usuariosAtivos: vinculos.length,
            ultimoAcesso: ultimos[0] ?? null,
          });
        }),
      ),
    );

    const data: PlataformaEmpresa[] = linhas.map((e) => {
      const uso = usoPorEmpresa.get(e.id);

      return {
        id: e.id,
        razaoSocial: e.razaoSocial,
        nomeFantasia: e.nomeFantasia,
        cnpj: e.cnpj,
        alias: e.alias,
        situacao: e.situacao,
        testeExpiraEm: e.testeExpiraEm?.toISOString() ?? null,
        limiteUsuarios: e.limiteUsuarios,
        usuariosAtivos: uso?.usuariosAtivos ?? 0,
        // Mesma comparação que decide o login, feita aqui e não na tela: duas
        // implementações discordariam no fuso do navegador.
        testeExpirado:
          e.situacao === 'teste' &&
          !podeAcessar(
            { situacao: e.situacao, testeExpiraEm: e.testeExpiraEm },
            agora,
          ),
        ultimoAcesso: uso?.ultimoAcesso?.toISOString() ?? null,
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
    const email = input.admin.email.toLowerCase();
    const [cnpjEmUso, contaExistente] = await Promise.all([
      this.prisma.empresa.findUnique({ where: { cnpj: input.cnpj } }),
      this.prisma.usuario.findFirst({
        where: { email, deletedAt: null },
        select: { id: true, nome: true },
      }),
    ]);
    if (cnpjEmUso) throw new ConflictException('CNPJ já cadastrado');

    // Conta que já existe é **vinculada**, não recusada: um administrador de
    // empresa pode administrar várias com uma conta só. Nome e senha do payload
    // são ignorados nesse caso — a pessoa entra com o que já usa, e trocar a
    // senha dela ao cadastrar outra empresa a deixaria de fora da primeira.
    if (!contaExistente) {
      if (!input.admin.nome || !input.admin.senha) {
        throw new ConflictException(
          'Não existe conta com este e-mail. Informe nome e senha provisória para criá-la.',
        );
      }
    }
    if (input.alias) {
      const aliasEmUso = await this.prisma.empresa.findFirst({
        where: { alias: input.alias, deletedAt: null },
        select: { id: true },
      });
      if (aliasEmUso) throw new ConflictException('Alias já em uso');
    }

    const senhaHash = contaExistente
      ? null
      : await bcrypt.hash(input.admin.senha as string, SALT_ROUNDS);

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

      if (contaExistente) {
        // Conta que já administra outra empresa: ganha o vínculo aqui também,
        // com o mesmo perfil Administrador. A senha dela não é tocada.
        await tx.usuarioEmpresa.create({
          data: {
            usuarioId: contaExistente.id,
            empresaId: empresa.id,
            perfilId: perfilAdmin.id,
            createdBy: ator.id,
            updatedBy: ator.id,
          },
        });
      } else {
        await tx.usuario.create({
          data: {
            nome: input.admin.nome as string,
            email,
            senhaHash: senhaHash as string,
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
      }

      await this.registrar(tx, ator, {
        acao: 'empresa.criada',
        empresaId: empresa.id,
        empresaRazaoSocial: empresa.razaoSocial,
        valorNovo:
          `situacao=${empresa.situacao}, admin=${email}` +
          (contaExistente ? ' (conta existente, vinculada)' : ' (conta nova)'),
      });

      return empresa;
    });
  }

  /**
   * Existe conta com este e-mail? Serve à tela de empresa nova, que muda o que
   * pede conforme a resposta: conta existente é vinculada (não pede nome nem
   * senha), conta nova é criada.
   *
   * Só a administração da plataforma alcança esta rota, e ela já enxerga todas
   * as contas — não há revelação nova aqui.
   */
  async procurarConta(email: string) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true, nome: true, email: true, ativo: true },
    });
    if (!usuario) return { existe: false as const };
    return {
      existe: true as const,
      nome: usuario.nome,
      email: usuario.email,
      ativo: usuario.ativo,
    };
  }

  /** Quem administra determinada empresa, e quantas outras cada um administra. */
  async listarAdministradoresDaEmpresa(
    empresaId: string,
  ): Promise<PlataformaEmpresaAdmin[]> {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
      select: { id: true },
    });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');

    const perfilAdmin = await this.prisma.perfil.findFirst({
      where: { nome: 'Administrador', deletedAt: null },
      select: { id: true },
    });
    if (!perfilAdmin) return [];

    // `usuario_empresas` tem RLS — sem `withTenant` a leitura volta vazia.
    const vinculos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.findMany({
        where: { empresaId, perfilId: perfilAdmin.id, ativo: true },
        select: {
          usuarioId: true,
          usuario: {
            select: {
              nome: true,
              email: true,
              ativo: true,
              ultimoLogin: true,
            },
          },
        },
      }),
    );

    // Quantas empresas cada um administra: é o que diz a quem olha que aquela
    // conta não é exclusiva desta empresa, e que removê-la aqui não a apaga.
    //
    // A contagem atravessa empresas, então **não** pode sair de um `groupBy`
    // solto: `usuario_empresas` tem RLS, e fora de um contexto a policy filtra
    // tudo. O caminho é a segunda policy da tabela, `self_usuario_empresas`,
    // que libera as linhas do próprio usuário — é para isso que `withUsuario`
    // existe, e é como o `me()` monta o seletor de empresas.
    //
    // (A primeira versão disto usava `groupBy` fora de contexto e caía num
    // fallback `?? 1`, que fazia o zero devolvido pela policy passar por
    // "administra uma empresa". Aqui não há fallback: se a contagem falhar,
    // aparece como zero e alguém percebe.)
    const contagens = await Promise.all(
      vinculos.map((v) =>
        this.prisma.withUsuario(v.usuarioId, (tx) =>
          tx.usuarioEmpresa.count({
            where: {
              usuarioId: v.usuarioId,
              perfilId: perfilAdmin.id,
              ativo: true,
            },
          }),
        ),
      ),
    );

    return vinculos.map((v, i) => ({
      usuarioId: v.usuarioId,
      nome: v.usuario.nome,
      email: v.usuario.email,
      ativo: v.usuario.ativo,
      empresasQueAdministra: contagens[i],
      ultimoLogin: v.usuario.ultimoLogin?.toISOString() ?? null,
    }));
  }

  /**
   * Vincula uma conta existente a uma empresa, como Administrador dela.
   *
   * É o caminho que faltava: a criação de empresa recusava e-mail repetido
   * aconselhando "vincule-o à nova empresa", para algo que não existia. A rota
   * de vínculo do módulo de usuários não serve aqui — é do tenant, exige
   * permissão **naquela** empresa, e quem administra o SaaS não a tem.
   *
   * Consome vaga do limite, como qualquer vínculo: a mesma pessoa administrando
   * duas empresas ocupa um lugar em cada, porque cada uma paga a sua.
   */
  async vincularAdministrador(empresaId: string, email: string, ator: Ator) {
    const [empresa, usuario, perfilAdmin] = await Promise.all([
      this.prisma.empresa.findFirst({
        where: { id: empresaId, deletedAt: null },
        select: { id: true, razaoSocial: true },
      }),
      this.prisma.usuario.findFirst({
        where: { email: email.toLowerCase(), deletedAt: null },
        select: { id: true, email: true },
      }),
      this.prisma.perfil.findFirst({
        where: { nome: 'Administrador', deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!empresa) throw new NotFoundException('Empresa não encontrada');
    if (!usuario) {
      throw new NotFoundException(
        'Nenhuma conta com este e-mail. Ela precisa existir antes de ser vinculada.',
      );
    }
    if (!perfilAdmin) {
      throw new NotFoundException('Perfil Administrador não encontrado');
    }

    return this.prisma.withTenant(empresaId, async (tx) => {
      const jaVinculado = await tx.usuarioEmpresa.findUnique({
        where: {
          usuarioId_empresaId: { usuarioId: usuario.id, empresaId },
        },
        select: { ativo: true, perfilId: true },
      });

      if (jaVinculado?.ativo && jaVinculado.perfilId === perfilAdmin.id) {
        throw new ConflictException(
          'Esta conta já administra esta empresa.',
        );
      }

      // Vaga só é consumida por vínculo que não estava ativo — promover alguém
      // que já trabalha aqui de Vendedor para Administrador não ocupa um lugar
      // a mais.
      if (!jaVinculado?.ativo) {
        await garantirVagaDeUsuario(tx, empresaId, usuario.id);
      }

      await tx.usuarioEmpresa.upsert({
        where: {
          usuarioId_empresaId: { usuarioId: usuario.id, empresaId },
        },
        create: {
          usuarioId: usuario.id,
          empresaId,
          perfilId: perfilAdmin.id,
          createdBy: ator.id,
          updatedBy: ator.id,
        },
        update: {
          perfilId: perfilAdmin.id,
          ativo: true,
          updatedBy: ator.id,
        },
      });

      await this.registrar(tx, ator, {
        acao: 'empresa.admin_vinculado',
        empresaId: empresa.id,
        empresaRazaoSocial: empresa.razaoSocial,
        valorNovo: usuario.email,
      });

      return { success: true };
    });
  }

  /**
   * Tira o vínculo de administrador de uma empresa (desativa, não apaga).
   *
   * Recusa o último: uma empresa sem administrador nenhum não tem quem cadastre
   * usuário ou mexa em configuração, e a saída seria a plataforma vincular
   * alguém de fora. A conta em si continua existindo e administrando as outras
   * empresas dela.
   */
  async desvincularAdministrador(
    empresaId: string,
    usuarioId: string,
    ator: Ator,
  ) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { id: empresaId, deletedAt: null },
      select: { id: true, razaoSocial: true },
    });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');

    const perfilAdmin = await this.prisma.perfil.findFirst({
      where: { nome: 'Administrador', deletedAt: null },
      select: { id: true },
    });
    if (!perfilAdmin) throw new NotFoundException('Perfil Administrador não encontrado');

    return this.prisma.withTenant(empresaId, async (tx) => {
      const admins = await tx.usuarioEmpresa.count({
        where: { empresaId, perfilId: perfilAdmin.id, ativo: true },
      });
      if (admins <= 1) {
        throw new ConflictException(
          'Esta é a única conta que administra a empresa. Vincule outra antes de remover esta.',
        );
      }

      const vinculo = await tx.usuarioEmpresa.findUnique({
        where: { usuarioId_empresaId: { usuarioId, empresaId } },
        select: { ativo: true, usuario: { select: { email: true } } },
      });
      if (!vinculo?.ativo) {
        throw new NotFoundException('Esta conta não administra esta empresa');
      }

      await tx.usuarioEmpresa.update({
        where: { usuarioId_empresaId: { usuarioId, empresaId } },
        data: { ativo: false, updatedBy: ator.id },
      });

      await this.registrar(tx, ator, {
        acao: 'empresa.admin_desvinculado',
        empresaId: empresa.id,
        empresaRazaoSocial: empresa.razaoSocial,
        valorAnterior: vinculo.usuario.email,
      });

      return { success: true };
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
   * Promove pelo e-mail, procurando o usuário em toda a base.
   *
   * A alternativa era a tela buscar em `GET /usuarios` e mandar o id, mas
   * aquela rota é do tenant: exige `usuarios.visualizar` e enxerga só a
   * empresa da sessão. Quem administra a plataforma promove gente de qualquer
   * empresa, e pode não ter permissão de usuários em lugar nenhum.
   */
  async promoverPorEmail(email: string, ator: Ator) {
    const usuario = await this.prisma.usuario.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true },
    });
    if (!usuario) {
      throw new NotFoundException(
        'Nenhum usuário com este e-mail. A conta precisa existir antes de ser promovida.',
      );
    }
    return this.definirAdmin(usuario.id, true, ator);
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
