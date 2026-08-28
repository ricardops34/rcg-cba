import { createHash, randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { PortalClienteLogin, PortalClienteRefresh } from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PortalClienteJwtPayload } from './portal-cliente-auth.types';

type Meta = { ip?: string; userAgent?: string };

@Injectable()
export class PortalClienteAuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private registrar(email: string, evento: string, meta: Meta, dados: { empresaId?: string; contatoId?: string; detalhe?: string } = {}) {
    return this.prisma.portalClienteAcessoLog.create({ data: { email, evento, ...dados, ...meta } });
  }

  private async contexto(credencial: { id: string; empresaId: string; contatoId: string }) {
    return this.prisma.withTenant(credencial.empresaId, async (tx) => {
      const contato = await tx.clienteContato.findFirst({
        where: { id: credencial.contatoId, empresaId: credencial.empresaId, ativo: true },
        include: {
          cliente: { include: { portalHabilitacao: true } },
          perfil: { include: { permissoes: { where: { permitido: true }, include: { rotina: true } } } },
        },
      });
      const config = await tx.portalClienteConfig.findUnique({ where: { empresaId: credencial.empresaId } });
      if (!contato || !contato.cliente.ativo || !contato.cliente.portalHabilitacao?.ativo || !config?.ativo) {
        throw new UnauthorizedException('Acesso ao portal não habilitado');
      }
      const permissoes = contato.perfil?.permissoes.map((p) => `${p.rotina.codigo}.${p.acao}`) ?? [];
      return { contato, permissoes };
    });
  }

  private async emitir(credencial: { id: string; empresaId: string; contatoId: string }, meta: Meta) {
    const { contato, permissoes } = await this.contexto(credencial);
    const payload: PortalClienteJwtPayload = {
      sub: credencial.id,
      empresaId: credencial.empresaId,
      clienteId: contato.clienteId,
      contatoId: contato.id,
      perfilId: contato.perfilId,
      nome: contato.nome,
      email: contato.email,
      permissoes,
      aud: 'portal-cliente',
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.PORTAL_JWT_ACCESS_SECRET,
      audience: 'portal-cliente',
      expiresIn: '15m',
    });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.portalClienteSessao.create({
      data: {
        credencialId: credencial.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ...meta,
      },
    });
    return { accessToken, refreshToken, expiresIn: 900 };
  }

  async login(input: PortalClienteLogin, meta: Meta) {
    const empresaAlias = input.empresaAlias.toLowerCase();
    const email = input.email.toLowerCase();
    const credencial = await this.prisma.portalClienteCredencial.findUnique({
      where: { empresaAlias_emailNormalizado: { empresaAlias, emailNormalizado: email } },
    });
    if (credencial?.bloqueadoAte && credencial.bloqueadoAte > new Date()) {
      throw new HttpException('Conta temporariamente bloqueada', HttpStatus.LOCKED);
    }
    if (!credencial?.ativo || !(await bcrypt.compare(input.senha, credencial.senhaHash))) {
      await this.registrar(email, 'login_falha', meta, { empresaId: credencial?.empresaId, contatoId: credencial?.contatoId });
      if (credencial) {
        const tentativasFalhas = credencial.tentativasFalhas + 1;
        await this.prisma.portalClienteCredencial.update({
          where: { id: credencial.id },
          data: {
            tentativasFalhas,
            bloqueadoAte: tentativasFalhas >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
          },
        });
      }
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const tokens = await this.emitir(credencial, meta);
    await this.prisma.portalClienteCredencial.update({
      where: { id: credencial.id },
      data: { ultimoLogin: new Date(), tentativasFalhas: 0, bloqueadoAte: null },
    });
    await this.registrar(email, 'login_sucesso', meta, { empresaId: credencial.empresaId, contatoId: credencial.contatoId });
    return tokens;
  }

  async refresh(input: PortalClienteRefresh, meta: Meta) {
    const sessao = await this.prisma.portalClienteSessao.findUnique({
      where: { tokenHash: this.hash(input.refreshToken) },
      include: { credencial: true },
    });
    if (!sessao || sessao.revogadoEm || sessao.expiresAt <= new Date() || !sessao.credencial.ativo) {
      throw new UnauthorizedException('Sessão inválida');
    }
    await this.prisma.portalClienteSessao.update({ where: { id: sessao.id }, data: { revogadoEm: new Date() } });
    return this.emitir(sessao.credencial, meta);
  }

  async logout(refreshToken: string) {
    await this.prisma.portalClienteSessao.updateMany({
      where: { tokenHash: this.hash(refreshToken), revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    return { success: true };
  }
}
