import { randomBytes, createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
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

  private async buildAccessToken(usuarioEmpresaId: string) {
    const vinculo = await this.prisma.usuarioEmpresa.findUniqueOrThrow({
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
    });

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

    const vinculo = await this.prisma.usuarioEmpresa.findFirst({
      where: { usuarioId: usuario.id, ativo: true, empresa: { ativo: true } },
      orderBy: { createdAt: 'asc' },
    });

    if (!vinculo) {
      throw new UnauthorizedException(
        'Usuário sem empresa ativa vinculada',
      );
    }

    const { accessToken } = await this.buildAccessToken(vinculo.id);
    const refreshToken = await this.issueRefreshToken(usuario.id, meta);

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

  private async issueRefreshToken(usuarioId: string, meta: RequestMeta) {
    const token = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        usuarioId,
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

    const vinculo = await this.prisma.usuarioEmpresa.findFirst({
      where: {
        usuarioId: stored.usuarioId,
        ativo: true,
        empresa: { ativo: true },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!vinculo) {
      throw new UnauthorizedException('Usuário sem empresa ativa vinculada');
    }

    const { accessToken } = await this.buildAccessToken(vinculo.id);
    const refreshToken = await this.issueRefreshToken(stored.usuarioId, meta);

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

  async me(usuarioId: string, empresaAtivaId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });

    const vinculos = await this.prisma.usuarioEmpresa.findMany({
      where: { usuarioId, ativo: true },
      include: { empresa: true, perfil: true },
    });

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
      empresas: vinculos.map((v) => ({
        empresaId: v.empresaId,
        nomeFantasia: v.empresa.nomeFantasia,
        perfilId: v.perfilId,
        perfilNome: v.perfil.nome,
      })),
      permissoes,
    };
  }
}
