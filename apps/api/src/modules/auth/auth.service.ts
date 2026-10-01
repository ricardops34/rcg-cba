import { gravarWhatsappDoUsuario } from '../../common/usuarios/whatsapp-do-usuario';
import {
  MOTIVO_DESCONECTADO,
  MOTIVO_NOVO_ACESSO,
  SessaoEncerradaException,
} from '../../common/sessao/sessao-encerrada.exception';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { UPLOADS_DIR } from '../../common/uploads/uploads.config';
import {
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import { AcessosService } from '../acessos/acessos.service';
import { HorarioTrabalhoService } from '../acessos/horario-trabalho.service';
import { ForaDoExpedienteException } from '../../common/horario/horario-trabalho';
import {
  motivoBloqueio,
  whereEmpresaAcessivel,
} from '../../common/empresa/situacao-empresa';
import {
  completeFirstAccessSchema,
  type AvatarPadraoInput,
  type CompleteFirstAccessInput,
  type ChangePasswordInput,
  type LoginInput,
  type RefreshInput,
} from '@plataforma/contracts';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const SALT_ROUNDS = 12;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MODULO_ADMINISTRACAO_ID = 'seed-modulo-administracao';

type DadosPrimeiroAcesso = {
  nome: string;
  primeiroAcessoConcluidoEm: Date | null;
};

type VinculoPrimeiroAcesso = {
  telefone: string | null;
  dataNascimento: Date | null;
};

/**
 * O marco de conclusão sozinho não basta: a migration inicial preservou quem
 * já havia entrado na plataforma, inclusive cadastros sem telefone ou data de
 * nascimento. Nesses casos o formulário precisa aparecer para reparar os
 * dados que ficaram pendentes.
 */
export function precisaCompletarPrimeiroAcesso(
  usuario: DadosPrimeiroAcesso,
  vinculo?: VinculoPrimeiroAcesso,
) {
  if (!usuario.primeiroAcessoConcluidoEm) return true;

  return !completeFirstAccessSchema.safeParse({
    nome: usuario.nome,
    telefoneInstitucional: vinculo?.telefone ?? '',
    dataNascimento: vinculo?.dataNascimento?.toISOString().slice(0, 10) ?? '',
  }).success;
}

/** Sobe da rotina até o módulo — o `ativo` de qualquer nível derruba o de baixo. */
const ROTINA_COM_ARVORE = {
  menu: { include: { modulo: true, menuPai: true } },
} as const;

type RotinaComArvore = {
  ativo: boolean;
  menu: {
    id: string;
    moduloId: string;
    menuPaiId: string | null;
    ativo: boolean;
    modulo: { ativo: boolean };
    menuPai: { ativo: boolean } | null;
  };
};

/** O que a empresa desligou — ausência de linha é "ligado". */
interface DesativadosDaEmpresa {
  modulos: Set<string>;
  menus: Set<string>;
}

/**
 * Desligar um módulo na tela de Estrutura precisa desligá-lo de verdade, não só
 * escondê-lo: o menu lateral é montado a partir destas permissões, mas a URL
 * digitada à mão não. Podando aqui — onde a lista de permissões nasce — o item
 * some da navegação e a API passa a responder 403, com uma regra só.
 *
 * São dois desligamentos, e os dois contam: o `ativo` do catálogo (global, do
 * administrador da plataforma) e o da empresa (`empresa_modulos`/
 * `empresa_menus`, do administrador dela).
 *
 * Quem já está logado continua com o token antigo até ele expirar (15 min).
 *
 * Perfil `sistemaBase` não passa por aqui: o `PermissionsGuard` libera pelo
 * `isAdmin` antes de olhar a lista. É aceito — quem liga e desliga é ele.
 */
function rotinaNoAr(rotina: RotinaComArvore, daEmpresa: DesativadosDaEmpresa) {
  const menu = rotina.menu;
  return (
    rotina.ativo &&
    menu.ativo &&
    menu.modulo.ativo &&
    (menu.menuPai?.ativo ?? true) &&
    !daEmpresa.modulos.has(menu.moduloId) &&
    !daEmpresa.menus.has(menu.id) &&
    !(menu.menuPaiId ? daEmpresa.menus.has(menu.menuPaiId) : false)
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly politicaSenhaService: PoliticaSenhaService,
    private readonly acessos: AcessosService,
    private readonly horarios: HorarioTrabalhoService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Módulos e menus que **esta empresa** desligou. As tabelas têm RLS, então a
   * consulta precisa do `withTenant` — fora dele a policy filtra tudo e voltaria
   * vazio, o que aqui significaria "nada desligado" e abriria o que a empresa
   * fechou.
   */
  private async desativadosDaEmpresa(empresaId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [modulos, menus] = await Promise.all([
        tx.empresaModulo.findMany({
          where: { empresaId, ativo: false },
          select: { moduloId: true },
        }),
        tx.empresaMenu.findMany({
          where: { empresaId, ativo: false },
          select: { menuId: true },
        }),
      ]);
      return {
        modulos: new Set(modulos.map((m) => m.moduloId)),
        menus: new Set(menus.map((m) => m.menuId)),
      };
    });
  }

  private async buildAccessToken(
    usuarioEmpresaId: string,
    empresaId: string,
    /** Sessão do login — o JwtAuthGuard confere se segue aberta. */
    sessaoId: string | null,
  ) {
    const vinculo = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.findUniqueOrThrow({
        where: { id: usuarioEmpresaId },
        include: {
          // O perfil é do usuário (igual em todas as empresas do grupo); o
          // vínculo diz só que ele tem acesso a esta empresa.
          usuario: {
            include: {
              perfil: {
                include: {
                  permissoes: {
                    where: { permitido: true },
                    include: { rotina: { include: ROTINA_COM_ARVORE } },
                  },
                },
              },
            },
          },
          empresa: true,
        },
      }),
    );
    const perfil = vinculo.usuario.perfil;

    // Para perfis admin do sistema (sistemaBase: true), PermissionsGuard
    // libera o acesso direto (isAdmin = true) sem precisar checar array.
    // Omitir as 470+ permissões do token reduz o JWT de 16 KB para ~400 bytes,
    // evitando erro 431 Request Header Fields Too Large.
    const permissoes = perfil.sistemaBase
      ? []
      : await (async () => {
          const daEmpresa = await this.desativadosDaEmpresa(empresaId);
          return perfil.permissoes
            .filter(
              (p) =>
                p.rotina.menu.moduloId !== MODULO_ADMINISTRACAO_ID &&
                rotinaNoAr(p.rotina, daEmpresa),
            )
            .map((p) => `${p.rotina.codigo}.${p.acao}`);
        })();

    const payload = {
      sub: vinculo.usuarioId,
      nome: vinculo.usuario.nome,
      email: vinculo.usuario.email,
      empresaAtivaId: vinculo.empresaId,
      isAdmin: perfil.sistemaBase,
      // Autoridade do perfil do usuário (ver Perfil.administraPlataforma no
      // schema). Desde 30/09/2026 o perfil é da conta, e a conta é de um grupo
      // só: trocar de empresa não troca de perfil.
      administradorPlataforma: perfil.administraPlataforma,
      permissoes,
      ...(sessaoId ? { sid: sessaoId } : {}),
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as never,
    });

    return { accessToken, vinculo };
  }

  private async findVinculoAtivo(usuarioId: string, empresaId?: string) {
    return this.prisma.withUsuario(usuarioId, (tx) =>
      tx.usuarioEmpresa.findFirst({
        where: {
          usuarioId,
          ativo: true,
          empresa: whereEmpresaAcessivel(),
          ...(empresaId ? { empresaId } : {}),
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  /**
   * true se a senha foi marcada para troca obrigatória (reset por admin,
   * senha provisória de vendedor) ou expirou pela política vigente — usado
   * tanto no login quanto em `me()` (esta última reavalia a cada carga da
   * sessão, pra pegar uma expiração que ocorreu no meio de uma sessão longa).
   */
  private async computeMustChangePassword(usuario: {
    id: string;
    deveTrocarSenha: boolean;
    senhaAlteradaEm: Date | null;
  }): Promise<boolean> {
    const politica = await this.politicaSenhaService.getVigenteParaUsuario(
      usuario.id,
    );
    const senhaExpirada =
      !!politica.diasParaExpirar &&
      !!usuario.senhaAlteradaEm &&
      Date.now() - usuario.senhaAlteradaEm.getTime() >=
        politica.diasParaExpirar * 24 * 60 * 60 * 1000;
    return usuario.deveTrocarSenha || senhaExpirada;
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const email = input.email.toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });

    if (!usuario || !usuario.ativo) {
      await this.acessos.registrar({
        evento: 'login_falha',
        email,
        usuarioId: usuario?.id ?? null,
        detalhe: usuario ? 'Usuário inativo' : 'E-mail não cadastrado',
        ...meta,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
      await this.acessos.registrar({
        evento: 'login_bloqueado',
        email,
        usuarioId: usuario.id,
        detalhe: `Conta bloqueada até ${usuario.bloqueadoAte.toISOString()}`,
        ...meta,
      });
      throw new HttpException(
        'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente mais tarde.',
        HttpStatus.LOCKED,
      );
    }

    const senhaValida = await bcrypt.compare(input.senha, usuario.senhaHash);
    if (!senhaValida) {
      const politica = await this.politicaSenhaService.getVigenteParaUsuario(
        usuario.id,
      );
      const tentativas = usuario.tentativasFalhas + 1;
      const bloqueou = tentativas >= politica.tentativasAntesBloqueio;
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: bloqueou
          ? {
              tentativasFalhas: 0,
              bloqueadoAte: new Date(
                Date.now() + politica.minutosBloqueio * 60_000,
              ),
            }
          : { tentativasFalhas: tentativas },
      });
      await this.acessos.registrar({
        evento: bloqueou ? 'login_bloqueado' : 'login_falha',
        email,
        usuarioId: usuario.id,
        detalhe: bloqueou
          ? `Senha incorreta ${tentativas}ª vez — conta bloqueada por ${politica.minutosBloqueio} min`
          : `Senha incorreta (tentativa ${tentativas} de ${politica.tentativasAntesBloqueio})`,
        ...meta,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Quando o login vem com o alias da empresa (?empresa=<alias> na tela de
    // login), a sessão entra diretamente nessa empresa — desde que o usuário
    // tenha vínculo ativo com ela. Sem alias, cai na primeira empresa ativa.
    let empresaId: string | undefined;
    if (input.empresaAlias) {
      // A empresa é buscada **sem** filtrar situação, e só então recusada.
      // Filtrar aqui devolveria "você não tem acesso a esta empresa" para o
      // usuário de uma empresa suspensa, mandando ele procurar o problema no
      // vínculo dele — que está perfeito. O motivo certo vem de
      // `motivoBloqueio`, a mesma fonte que decide o acesso.
      const empresa = await this.prisma.empresa.findFirst({
        where: { alias: input.empresaAlias, deletedAt: null },
        select: { id: true, situacao: true, testeExpiraEm: true },
      });
      if (!empresa) {
        throw new ForbiddenException('Você não tem acesso a esta empresa');
      }
      const bloqueio = motivoBloqueio(empresa);
      if (bloqueio) {
        await this.acessos.registrar({
          evento: 'login_falha',
          email,
          usuarioId: usuario.id,
          detalhe: `Empresa sem acesso liberado (${empresa.situacao})`,
          ...meta,
        });
        throw new ForbiddenException(bloqueio);
      }
      empresaId = empresa.id;
    }

    const vinculo = await this.findVinculoAtivo(usuario.id, empresaId);
    if (!vinculo) {
      await this.acessos.registrar({
        evento: 'login_falha',
        email,
        usuarioId: usuario.id,
        detalhe: input.empresaAlias
          ? 'Sem vínculo ativo com a empresa informada'
          : 'Usuário sem empresa ativa vinculada',
        ...meta,
      });
      throw input.empresaAlias
        ? new ForbiddenException('Você não tem acesso a esta empresa')
        : new UnauthorizedException('Usuário sem empresa ativa vinculada');
    }

    // Expediente só é avaliado depois da senha conferir: quem erra a senha
    // recebe sempre a mesma resposta, sem descobrir de tabela nenhuma. E depois
    // de saber a empresa, porque o feriado é dela (só pesa para quem tem a
    // restrição de horário no cadastro).
    const expediente = await this.horarios.verificar(usuario.id, vinculo.empresaId);
    if (!expediente.dentro) {
      await this.acessos.registrar({
        evento: 'login_fora_horario',
        email,
        usuarioId: usuario.id,
        empresaId: vinculo.empresaId,
        detalhe: expediente.motivo,
        ...meta,
      });
      throw new ForaDoExpedienteException(
        `Acesso permitido apenas em horário de trabalho. ${expediente.motivo}.`,
      );
    }

    // A sessão nasce aqui e acompanha as renovações de token pelo sessaoId —
    // é ela que mede o tempo de uso na tela de Acessos.
    const sessaoId = await this.acessos.abrirSessao({
      usuarioId: usuario.id,
      empresaId: vinculo.empresaId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    // Sessão única por usuário (decisão de 30/09/2026): este login derruba o
    // que estiver aberto em outro navegador ou computador — sessão encerrada e
    // renovação revogada; o token de acesso de lá para de valer na próxima
    // requisição (JwtAuthGuard). Abas do mesmo navegador são a mesma sessão.
    const substituidas = await this.acessos.encerrarSessoes(
      { usuarioId: usuario.id, manter: sessaoId },
      MOTIVO_NOVO_ACESSO,
    );
    if (substituidas.length > 0) {
      await this.acessos.registrar({
        evento: 'sessao_substituida',
        email,
        usuarioId: usuario.id,
        empresaId: vinculo.empresaId,
        detalhe: `${substituidas.length} sessão(ões) anterior(es) encerrada(s) por novo acesso`,
        ...meta,
      });
    }
    const { accessToken } = await this.buildAccessToken(
      vinculo.id,
      vinculo.empresaId,
      sessaoId,
    );
    const refreshToken = await this.issueRefreshToken(
      usuario.id,
      vinculo.empresaId,
      meta,
      sessaoId,
    );

    const mustChangePassword = await this.computeMustChangePassword(usuario);

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        ultimoLogin: new Date(),
        tentativasFalhas: 0,
        bloqueadoAte: null,
      },
    });

    await this.acessos.registrar({
      evento: 'login_sucesso',
      email,
      usuarioId: usuario.id,
      empresaId: vinculo.empresaId,
      ...meta,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
      mustChangePassword,
    };
  }

  /**
   * Branding público de uma empresa pelo alias, para a tela de login exibir
   * logo e nome antes de existir sessão. Não expõe dados sensíveis.
   */
  async empresaBranding(alias: string) {
    const empresa = await this.prisma.empresa.findFirst({
      // Branding segue o mesmo recorte do acesso: empresa suspensa não tem por
      // que emprestar a marca dela a uma tela de login que não vai deixar
      // ninguém entrar.
      where: {
        alias: alias.toLowerCase(),
        deletedAt: null,
        ...whereEmpresaAcessivel(),
      },
      select: { alias: true, nomeFantasia: true, logoUrl: true },
    });
    if (!empresa || !empresa.alias) {
      throw new NotFoundException('Empresa não encontrada');
    }
    return {
      alias: empresa.alias,
      nomeFantasia: empresa.nomeFantasia,
      logoUrl: empresa.logoUrl,
    };
  }

  private async issueRefreshToken(
    usuarioId: string,
    empresaId: string,
    meta: RequestMeta,
    sessaoId: string | null,
  ) {
    const token = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        usuarioId,
        empresaId,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ip: meta.ip,
        userAgent: meta.userAgent,
        sessaoId,
      },
    });
    return token;
  }

  async refresh(input: RefreshInput, meta: RequestMeta) {
    const tokenHash = this.hashToken(input.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    // Sessão derrubada por novo acesso ou pela administração: explica o motivo
    // (a tela volta ao login com ele), em vez de um "token inválido" seco.
    if (stored?.sessaoId) {
      const sessao = await this.acessos.situacaoSessao(stored.sessaoId);
      if (
        !sessao.aberta &&
        (sessao.motivo === MOTIVO_NOVO_ACESSO || sessao.motivo === MOTIVO_DESCONECTADO)
      ) {
        throw new SessaoEncerradaException(sessao.motivo);
      }
    }

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // A renovação não passa pelo JwtAuthGuard (é rota pública, autenticada
    // pelo próprio refresh token), então a trava de expediente precisa ser
    // conferida aqui também — senão bastaria deixar a aba aberta para o
    // sistema se renovar indefinidamente depois do fim do turno.
    const expediente = await this.horarios.verificar(stored.usuarioId, stored.empresaId);
    if (!expediente.dentro) {
      await this.encerrarAcessoPorHorario(stored.usuarioId, expediente.motivo);
      throw new ForaDoExpedienteException(
        `Acesso permitido apenas em horário de trabalho. ${expediente.motivo}.`,
      );
    }

    // Mantém a mesma empresa ativa da sessão original; só cai para a
    // primeira disponível se aquele vínculo específico não existir mais.
    const vinculo =
      (stored.empresaId
        ? await this.findVinculoAtivo(stored.usuarioId, stored.empresaId)
        : null) ?? (await this.findVinculoAtivo(stored.usuarioId));
    if (!vinculo) {
      throw new UnauthorizedException('Usuário sem empresa ativa vinculada');
    }

    const { accessToken } = await this.buildAccessToken(
      vinculo.id,
      vinculo.empresaId,
      stored.sessaoId,
    );
    const refreshToken = await this.issueRefreshToken(
      stored.usuarioId,
      vinculo.empresaId,
      meta,
      stored.sessaoId,
    );
    // Renovar token é o sinal de que a sessão segue em uso — é o que faz o
    // tempo de uso crescer sem uma escrita por requisição.
    if (stored.sessaoId) {
      await this.acessos.tocarSessao(stored.sessaoId, vinculo.empresaId);
    }

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  /**
   * Corta o acesso de quem saiu do expediente: revoga os refresh tokens
   * abertos (para a aba deixada aberta não se renovar), fecha as sessões e
   * deixa o evento no rastro de acessos.
   */
  private async encerrarAcessoPorHorario(usuarioId: string, motivo: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { email: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.acessos.encerrarSessoesDoUsuario(usuarioId, 'fora_horario');
    await this.acessos.registrar({
      evento: 'acesso_fora_horario',
      email: usuario?.email ?? '',
      usuarioId,
      detalhe: motivo,
    });
  }

  async logout(input: RefreshInput) {
    const tokenHash = this.hashToken(input.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        sessaoId: true,
        empresaId: true,
        usuarioId: true,
        usuario: { select: { email: true } },
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (stored) {
      if (stored.sessaoId) {
        await this.acessos.encerrarSessao(stored.sessaoId, 'logout');
      }
      await this.acessos.registrar({
        evento: 'logout',
        email: stored.usuario.email,
        usuarioId: stored.usuarioId,
        empresaId: stored.empresaId,
      });
    }
    return { success: true };
  }

  /** Troca a empresa ativa da sessão, emitindo um novo par de tokens. */
  async switchEmpresa(
    usuarioId: string,
    empresaId: string,
    meta: RequestMeta,
    /** Sessão do token de quem troca (ausente em token anterior à sessão única). */
    sessaoAtual?: string,
  ) {
    const vinculo = await this.findVinculoAtivo(usuarioId, empresaId);
    if (!vinculo) {
      throw new ForbiddenException('Usuário não tem acesso a esta empresa');
    }

    // Trocar de empresa não é uma sessão nova — é a mesma pessoa, seguindo o
    // trabalho. Reaproveita a sessão do próprio token (o JwtAuthGuard já
    // conferiu que está aberta); token antigo, sem sessão, cai na última
    // aberta do usuário, e só abre outra se não houver nenhuma.
    const aberta = sessaoAtual
      ? { id: sessaoAtual }
      : await this.prisma.sessao.findFirst({
          where: { usuarioId, encerradaEm: null },
          orderBy: { iniciadaEm: 'desc' },
          select: { id: true },
        });
    const sessaoId =
      aberta?.id ??
      (await this.acessos.abrirSessao({
        usuarioId,
        empresaId: vinculo.empresaId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      }));
    const { accessToken } = await this.buildAccessToken(
      vinculo.id,
      vinculo.empresaId,
      sessaoId,
    );
    const refreshToken = await this.issueRefreshToken(
      usuarioId,
      vinculo.empresaId,
      meta,
      sessaoId,
    );
    await this.acessos.tocarSessao(sessaoId, vinculo.empresaId);

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { email: true },
    });
    await this.acessos.registrar({
      evento: 'troca_empresa',
      email: usuario?.email ?? '',
      usuarioId,
      empresaId: vinculo.empresaId,
      ...meta,
    });

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  async me(usuarioId: string, empresaAtivaId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });

    const vinculos = await this.prisma.withUsuario(usuarioId, (tx) =>
      tx.usuarioEmpresa.findMany({
        where: { usuarioId, ativo: true },
        include: {
          empresa: true,
          rotinaInicial: {
            select: { codigo: true, menu: { select: { rota: true } } },
          },
        },
      }),
    );

    // O perfil é do usuário, igual em todas as empresas do grupo. withUsuario:
    // "perfis" tem RLS, e a policy deixa o próprio usuário ver o seu perfil
    // mesmo quando é de um grupo — o me() roda também no login e na troca de
    // empresa, sem token na requisição.
    const perfil = await this.prisma.withUsuario(usuarioId, (tx) =>
      tx.perfil.findUniqueOrThrow({
        where: { id: usuario.perfilId },
        select: {
          nome: true,
          sistemaBase: true,
          administraPlataforma: true,
          rotinaInicial: {
            select: {
              nome: true,
              menu: {
                select: { rota: true },
              },
            },
          },
        },
      }),
    );

    const ativo = vinculos.find((v) => v.empresaId === empresaAtivaId);
    const daEmpresa = ativo
      ? await this.desativadosDaEmpresa(ativo.empresaId)
      : { modulos: new Set<string>(), menus: new Set<string>() };
    const permissoes = ativo
      ? (
          await this.prisma.withUsuario(usuarioId, (tx) =>
            tx.perfilPermissao.findMany({
              where: { perfilId: usuario.perfilId, permitido: true },
              include: { rotina: { include: ROTINA_COM_ARVORE } },
            }),
          )
        )
          .filter(
            (p) =>
              (perfil.sistemaBase ||
                p.rotina.menu.moduloId !== MODULO_ADMINISTRACAO_ID) &&
              rotinaNoAr(p.rotina, daEmpresa),
          )
          .map((p) => `${p.rotina.codigo}.${p.acao}`)
      : [];

    const mustChangePassword = await this.computeMustChangePassword(usuario);
    // A escolha do usuário só vale enquanto ele enxerga a rotina: o perfil
    // pode ter mudado, ou o módulo ter sido desligado, depois da escolha.
    // Nesses casos a gravação fica, e volta a valer se o acesso voltar.
    const escolhida = ativo?.rotinaInicial;
    const rotaEscolhida =
      escolhida?.menu.rota &&
      permissoes.includes(`${escolhida.codigo}.visualizar`)
        ? escolhida.menu.rota
        : null;
    const rotinaInicialRota = !ativo
      ? null
      : (rotaEscolhida ?? perfil.rotinaInicial?.menu?.rota ?? null);

    return {
      id: usuario.id,
      nome: usuario.nome,
      avatarUrl: usuario.avatarUrl,
      telefoneInstitucional: usuario.celular ?? usuario.telefone ?? null,
      whatsapp: usuario.celular ?? usuario.telefone ?? null,
      dataNascimento: usuario.dataNascimento?.toISOString().slice(0, 10) ?? null,
      mustCompleteFirstAccess: precisaCompletarPrimeiroAcesso(usuario, usuario),
      email: usuario.email,
      // Sem acesso à empresa ativa, nenhuma autoridade (ver buildAccessToken).
      administradorPlataforma: ativo ? perfil.administraPlataforma : false,
      empresaAtivaId,
      empresas: vinculos.map((v) => ({
        empresaId: v.empresaId,
        nomeFantasia: v.empresa.nomeFantasia,
        logoUrl: v.empresa.logoUrl,
        bannerAtivo: v.empresa.bannerAtivo,
        bannerCor: v.empresa.bannerCor,
        bannerImagemUrl: v.empresa.bannerImagemUrl,
        situacao: v.empresa.situacao,
        testeExpiraEm: v.empresa.testeExpiraEm?.toISOString() ?? null,
        ePlataforma: v.empresa.ePlataforma,
        // O mesmo em todas: o perfil é do usuário. Mantido por empresa para
        // não mudar o contrato de quem já lê daqui.
        perfilId: usuario.perfilId,
        perfilNome: perfil.nome,
      })),
      permissoes,
      mustChangePassword,
      rotinaInicialRota,
      rotinaInicialId: ativo?.rotinaInicialId ?? null,
      rotinaInicialPerfilNome: ativo ? (perfil.rotinaInicial?.nome ?? null) : null,
    };
  }

  async completeFirstAccess(
    usuarioId: string,
    empresaId: string,
    input: CompleteFirstAccessInput,
  ) {
    await this.prisma.withTenant(empresaId, async (tx) => {
      const usuario = await tx.usuario.findUniqueOrThrow({
        where: { id: usuarioId },
      });
      const vinculo = await tx.usuarioEmpresa.findFirst({
        where: { usuarioId, empresaId, ativo: true, deletedAt: null },
      });
      if (!vinculo)
        throw new ForbiddenException('Vínculo com a empresa indisponível');
      if (!precisaCompletarPrimeiroAcesso(usuario, usuario)) return;
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          nome: input.nome,
          telefone: input.telefoneInstitucional.replace(/\D/g, ''),
          dataNascimento: new Date(`${input.dataNascimento}T00:00:00.000Z`),
          primeiroAcessoConcluidoEm: new Date(),
          updatedBy: usuarioId,
        },
      });
      await gravarWhatsappDoUsuario(tx, usuarioId, empresaId, input.telefoneInstitucional, usuarioId);
      const vendedores = await tx.vendedor.findMany({
        where: { usuarioId, empresaId, deletedAt: null },
      });
      for (const vendedor of vendedores) {
        const data = {
          ...(vendedor.nome !== input.nome ? { nome: input.nome } : {}),
          ...(vendedor.dataNascimento?.toISOString().slice(0, 10) !==
          input.dataNascimento
            ? {
                dataNascimento: new Date(
                  `${input.dataNascimento}T00:00:00.000Z`,
                ),
              }
            : {}),
        };
        if (Object.keys(data).length) {
          await tx.vendedor.update({
            where: { id: vendedor.id },
            data: { ...data, updatedBy: usuarioId },
          });
        }
      }
    });
    return this.me(usuarioId, empresaId);
  }

  async uploadOwnAvatar(
    usuarioId: string,
    empresaId: string,
    file?: Express.Multer.File,
    autorId: string = usuarioId,
  ) {
    if (!file || file.size > 2 * 1024 * 1024)
      throw new BadRequestException('Envie uma foto de até 2 MB');
    const buffer = file.buffer;
    const extension = buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'png'
      : buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? 'jpg'
        : buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP'
          ? 'webp'
          : null;
    if (!extension)
      throw new BadRequestException('Envie uma foto PNG, JPEG ou WEBP');
    const filename = `${randomBytes(16).toString('hex')}.${extension}`;
    const directory = join(UPLOADS_DIR, 'avatares');
    await mkdir(directory, { recursive: true });
    const path = join(directory, filename);
    await writeFile(path, buffer);
    try {
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: {
          avatarUrl: `/uploads/avatares/${filename}`,
          updatedBy: autorId,
        },
      });
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw error;
    }
    return this.me(usuarioId, empresaId);
  }

  async selectDefaultAvatar(
    usuarioId: string,
    empresaId: string,
    avatar: AvatarPadraoInput['avatar'],
    autorId: string = usuarioId,
  ) {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        avatarUrl: `/avatares-padrao/${avatar}.jpg`,
        updatedBy: autorId,
      },
    });
    return this.me(usuarioId, empresaId);
  }

  async updateOwnProfile(
    usuarioId: string,
    empresaAtivaId: string,
    nome: string,
    whatsapp?: string,
    dataNascimento?: string,
  ) {
    if (dataNascimento !== undefined) {
      await this.gravarDataNascimento(
        usuarioId,
        empresaAtivaId,
        dataNascimento,
      );
    }
    await this.prisma.withTenant(empresaAtivaId, async (tx) => {
      if (whatsapp !== undefined) {
        await gravarWhatsappDoUsuario(tx, usuarioId, empresaAtivaId, whatsapp, usuarioId);
      }
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { nome: nome.trim(), updatedBy: usuarioId },
      });
    });
    return this.me(usuarioId, empresaAtivaId);
  }

  /**
   * O usuário é um só no grupo econômico, e a data de nascimento também
   * (decisão de 30/09/2026): grava no usuário e, como no primeiro acesso, no
   * cadastro de vendedor ligado a ele em cada empresa do grupo a que ele tem
   * acesso — esse cadastro é por empresa.
   */
  private async gravarDataNascimento(
    usuarioId: string,
    empresaAtivaId: string,
    dataNascimento: string,
  ) {
    const data = new Date(`${dataNascimento}T00:00:00.000Z`);
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { dataNascimento: data, updatedBy: usuarioId },
    });
    const ativa = await this.prisma.empresa.findUnique({
      where: { id: empresaAtivaId },
      select: { grupoEconomicoId: true },
    });
    const empresas = ativa
      ? await this.prisma.empresa.findMany({
          where: { grupoEconomicoId: ativa.grupoEconomicoId, deletedAt: null },
          select: { id: true },
        })
      : [{ id: empresaAtivaId }];
    for (const { id: empresaId } of empresas) {
      await this.prisma.withTenant(empresaId, async (tx) => {
        const acesso = await tx.usuarioEmpresa.count({
          where: { usuarioId, empresaId, ativo: true, deletedAt: null },
        });
        if (acesso === 0) return;
        await tx.vendedor.updateMany({
          where: { usuarioId, empresaId, deletedAt: null },
          data: { dataNascimento: data, updatedBy: usuarioId },
        });
      });
    }
  }

  /**
   * Grava a tela inicial do próprio usuário na empresa ativa. Só aceita rotina
   * que ele enxerga agora (`<codigo>.visualizar`, já podado por módulo/menu
   * desligado) e que tenha tela — o menu dela precisa de rota.
   */
  async updateRotinaInicial(
    usuarioId: string,
    empresaAtivaId: string,
    rotinaId: string | null,
    autorId: string = usuarioId,
  ) {
    if (rotinaId) {
      const rotina = await this.prisma.rotina.findFirst({
        where: { id: rotinaId, deletedAt: null },
        select: { codigo: true, menu: { select: { rota: true } } },
      });
      const { permissoes } = await this.me(usuarioId, empresaAtivaId);
      if (
        !rotina?.menu.rota ||
        !permissoes.includes(`${rotina.codigo}.visualizar`)
      ) {
        throw new BadRequestException(
          'Escolha uma tela a que você tenha acesso nesta empresa',
        );
      }
    }
    const { count } = await this.prisma.withTenant(empresaAtivaId, (tx) =>
      tx.usuarioEmpresa.updateMany({
        where: { usuarioId, empresaId: empresaAtivaId, ativo: true },
        data: { rotinaInicialId: rotinaId, updatedBy: autorId },
      }),
    );
    if (count === 0) {
      throw new ForbiddenException('Sem vínculo ativo com esta empresa');
    }
    return this.me(usuarioId, empresaAtivaId);
  }

  /** Recusa quem não tem vínculo ativo com a empresa (a leitura passa pela RLS dela). */
  async exigirVinculoAtivo(usuarioId: string, empresaId: string) {
    const vinculos = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.count({
        where: { usuarioId, empresaId, ativo: true, deletedAt: null },
      }),
    );
    if (!vinculos) {
      throw new ForbiddenException('O usuário não tem acesso a esta empresa');
    }
  }

  /**
   * As telas que o usuário pode escolher como inicial na empresa: uma por
   * menu com rota, entre as rotinas que ele enxerga (`<codigo>.visualizar`).
   * É o que o cadastro de usuário mostra ao administrador — a lista sai das
   * permissões de quem está sendo editado, não das de quem edita.
   */
  async telasIniciais(usuarioId: string, empresaId: string) {
    await this.exigirVinculoAtivo(usuarioId, empresaId);
    const alvo = await this.me(usuarioId, empresaId);
    const codigos = alvo.permissoes
      .filter((p) => p.endsWith('.visualizar'))
      .map((p) => p.slice(0, -'.visualizar'.length));
    const rotinas = await this.prisma.rotina.findMany({
      where: {
        codigo: { in: codigos },
        deletedAt: null,
        menu: { rota: { not: null } },
      },
      select: {
        id: true,
        menu: {
          select: {
            id: true,
            nome: true,
            ordem: true,
            menuPai: { select: { nome: true } },
            modulo: { select: { nome: true, ordem: true } },
          },
        },
      },
      orderBy: { nome: 'asc' },
    });
    const porMenu = new Map<
      string,
      { rotinaId: string; rotinaIds: string[]; rotulo: string; ordem: number[] }
    >();
    for (const r of rotinas) {
      const atual = porMenu.get(r.menu.id);
      if (atual) {
        atual.rotinaIds.push(r.id);
        continue;
      }
      porMenu.set(r.menu.id, {
        rotinaId: r.id,
        rotinaIds: [r.id],
        rotulo: [r.menu.modulo.nome, r.menu.menuPai?.nome, r.menu.nome]
          .filter(Boolean)
          .join(' › '),
        ordem: [r.menu.modulo.ordem, r.menu.ordem],
      });
    }
    const opcoes = [...porMenu.values()]
      .sort((a, b) => a.ordem[0] - b.ordem[0] || a.ordem[1] - b.ordem[1])
      .map(({ rotinaId, rotinaIds, rotulo }) => ({
        rotinaId,
        rotinaIds,
        rotulo,
      }));
    return {
      rotinaInicialId: alvo.rotinaInicialId,
      rotinaInicialPerfilNome: alvo.rotinaInicialPerfilNome,
      opcoes,
    };
  }

  /** Troca a senha do próprio usuário logado, exigindo a senha atual. */
  async changePassword(usuarioId: string, input: ChangePasswordInput) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });

    const senhaAtualValida = await bcrypt.compare(
      input.senhaAtual,
      usuario.senhaHash,
    );
    if (!senhaAtualValida) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    await this.politicaSenhaService.validarSenhaDoUsuario(
      usuarioId,
      input.novaSenha,
    );
    await this.politicaSenhaService.validarReuso(
      usuarioId,
      input.novaSenha,
      usuario.senhaHash,
    );

    const novoHash = await bcrypt.hash(input.novaSenha, SALT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await this.politicaSenhaService.registrarHistorico(
        usuarioId,
        usuario.senhaHash,
        tx,
      );
      await tx.usuario.update({
        where: { id: usuarioId },
        data: {
          senhaHash: novoHash,
          senhaAlteradaEm: new Date(),
          deveTrocarSenha: false,
          tentativasFalhas: 0,
          bloqueadoAte: null,
        },
      });
    });

    return { success: true };
  }
}
