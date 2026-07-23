import { randomBytes, createHash } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { LoginInput, RefreshInput } from '@plataforma/contracts';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async buildAccessToken(usuarioEmpresaId: string, empresaId: string) {
    const vinculo = await this.prisma.withTenant(empresaId, (tx) =>
      tx.usuarioEmpresa.findUniqueOrThrow({
        where: { id: usuarioEmpresaId },
        include: {
          usuario: true,
          empresa: true,
          perfil: {
            include: {
              permissoes: {
                where: { permitido: true },
                include: { rotina: true },
              },
            },
          },
        },
      }),
    );

    const permissoes = vinculo.perfil.permissoes.map(
      (p) => `${p.rotina.codigo}.${p.acao}`,
    );

    const payload = {
      sub: vinculo.usuarioId,
      nome: vinculo.usuario.nome,
      email: vinculo.usuario.email,
      empresaAtivaId: vinculo.empresaId,
      isAdmin: vinculo.perfil.sistemaBase,
      permissoes,
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
          empresa: { ativo: true },
          ...(empresaId ? { empresaId } : {}),
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const senhaValida = await bcrypt.compare(input.senha, usuario.senhaHash);
    if (!senhaValida) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Quando o login vem com o alias da empresa (?empresa=<alias> na tela de
    // login), a sessão entra diretamente nessa empresa — desde que o usuário
    // tenha vínculo ativo com ela. Sem alias, cai na primeira empresa ativa.
    let empresaId: string | undefined;
    if (input.empresaAlias) {
      const empresa = await this.prisma.empresa.findFirst({
        where: { alias: input.empresaAlias, ativo: true, deletedAt: null },
        select: { id: true },
      });
      if (!empresa) {
        throw new ForbiddenException('Você não tem acesso a esta empresa');
      }
      empresaId = empresa.id;
    }

    const vinculo = await this.findVinculoAtivo(usuario.id, empresaId);
    if (!vinculo) {
      throw input.empresaAlias
        ? new ForbiddenException('Você não tem acesso a esta empresa')
        : new UnauthorizedException('Usuário sem empresa ativa vinculada');
    }

    const { accessToken } = await this.buildAccessToken(vinculo.id, vinculo.empresaId);
    const refreshToken = await this.issueRefreshToken(
      usuario.id,
      vinculo.empresaId,
      meta,
    );

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { ultimoLogin: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }

  /**
   * Branding público de uma empresa pelo alias, para a tela de login exibir
   * logo e nome antes de existir sessão. Não expõe dados sensíveis.
   */
  async empresaBranding(alias: string) {
    const empresa = await this.prisma.empresa.findFirst({
      where: { alias: alias.toLowerCase(), ativo: true, deletedAt: null },
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
      },
    });
    return token;
  }

  async refresh(input: RefreshInput, meta: RequestMeta) {
    const tokenHash = this.hashToken(input.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

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

    // Mantém a mesma empresa ativa da sessão original; só cai para a
    // primeira disponível se aquele vínculo específico não existir mais.
    const vinculo =
      (stored.empresaId
        ? await this.findVinculoAtivo(stored.usuarioId, stored.empresaId)
        : null) ?? (await this.findVinculoAtivo(stored.usuarioId));
    if (!vinculo) {
      throw new UnauthorizedException('Usuário sem empresa ativa vinculada');
    }

    const { accessToken } = await this.buildAccessToken(vinculo.id, vinculo.empresaId);
    const refreshToken = await this.issueRefreshToken(
      stored.usuarioId,
      vinculo.empresaId,
      meta,
    );

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  async logout(input: RefreshInput) {
    const tokenHash = this.hashToken(input.refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  /** Troca a empresa ativa da sessão, emitindo um novo par de tokens. */
  async switchEmpresa(usuarioId: string, empresaId: string, meta: RequestMeta) {
    const vinculo = await this.findVinculoAtivo(usuarioId, empresaId);
    if (!vinculo) {
      throw new ForbiddenException(
        'Usuário não tem acesso a esta empresa',
      );
    }

    const { accessToken } = await this.buildAccessToken(vinculo.id, vinculo.empresaId);
    const refreshToken = await this.issueRefreshToken(
      usuarioId,
      vinculo.empresaId,
      meta,
    );

    return { accessToken, refreshToken, expiresIn: 15 * 60 };
  }

  async me(usuarioId: string, empresaAtivaId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });

    const vinculos = await this.prisma.withUsuario(usuarioId, (tx) =>
      tx.usuarioEmpresa.findMany({
        where: { usuarioId, ativo: true },
        include: { empresa: true },
      }),
    );

    // "perfis" tem RLS habilitada e só permite uma empresa ativa por vez;
    // como o usuário pode ter vínculo com várias empresas aqui, o nome do
    // perfil de cada uma precisa ser buscado no contexto de tenant dela.
    const perfis = await Promise.all(
      vinculos.map((v) =>
        this.prisma.withTenant(v.empresaId, (tx) =>
          tx.perfil.findUniqueOrThrow({
            where: { id: v.perfilId },
            select: { nome: true },
          }),
        ),
      ),
    );

    const ativo = vinculos.find((v) => v.empresaId === empresaAtivaId);
    const permissoes = ativo
      ? (
          await this.prisma.perfilPermissao.findMany({
            where: { perfilId: ativo.perfilId, permitido: true },
            include: { rotina: true },
          })
        ).map((p) => `${p.rotina.codigo}.${p.acao}`)
      : [];

    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      empresaAtivaId,
      empresas: vinculos.map((v, i) => ({
        empresaId: v.empresaId,
        nomeFantasia: v.empresa.nomeFantasia,
        logoUrl: v.empresa.logoUrl,
        perfilId: v.perfilId,
        perfilNome: perfis[i].nome,
      })),
      permissoes,
    };
  }
}
