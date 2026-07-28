import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PoliticaSenhaService } from '../politica-senha/politica-senha.service';
import { MailService } from '../../common/mail/mail.service';
import {
  buildPaginatedResult,
  paginationToSkipTake,
} from '../../common/pagination/paginate';
import type {
  VendedorCreate,
  VendedorQuery,
  VendedorUpdate,
} from '@plataforma/contracts';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

// Campos que a listagem aceita ordenar por — whitelist pra não repassar
// direto pro Prisma um sortBy arbitrário vindo da query string.
const SORT_FIELDS = new Set(['nome', 'codigoErp', 'email', 'ativo', 'createdAt']);
const SALT_ROUNDS = 12;

@Injectable()
export class VendedoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly politicaSenhaService: PoliticaSenhaService,
    private readonly mailService: MailService,
  ) {}

  private limpar<T extends Record<string, unknown>>(input: T) {
    // Campos string vazios do formulário viram null no banco.
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) out[k] = v === '' ? null : v;
    return out;
  }

  findAll(empresaId: string, query: VendedorQuery) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const where = {
        empresaId,
        deletedAt: null,
        ...(query.ativo !== undefined ? { ativo: query.ativo } : {}),
        ...(query.vendedor !== undefined ? { vendedor: query.vendedor } : {}),
        ...(query.supervisor !== undefined ? { supervisor: query.supervisor } : {}),
        ...(query.gerente !== undefined ? { gerente: query.gerente } : {}),
        ...(query.desligado !== undefined ? { desligado: query.desligado } : {}),
        ...(query.supervisorId ? { supervisorId: query.supervisorId } : {}),
        ...(query.search
          ? {
              OR: [
                { nome: { contains: query.search, mode: 'insensitive' as const } },
                { codigoErp: { contains: query.search, mode: 'insensitive' as const } },
                { email: { contains: query.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const sortField = query.sortBy && SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'nome';
      const [data, total] = await Promise.all([
        tx.vendedor.findMany({
          where,
          ...paginationToSkipTake(query),
          orderBy: { [sortField]: query.sortOrder },
        }),
        tx.vendedor.count({ where }),
      ]);
      return buildPaginatedResult(data, total, query);
    });
  }

  async findOne(empresaId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      return vendedor;
    });
  }

  create(empresaId: string, user: AuthenticatedUser, input: VendedorCreate) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.vendedor.create({
        data: {
          ...(this.limpar(input) as object),
          empresaId,
          createdBy: user.id,
          updatedBy: user.id,
        } as never,
      }),
    );
  }

  async update(empresaId: string, user: AuthenticatedUser, id: string, input: VendedorUpdate) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      return tx.vendedor.update({
        where: { id },
        data: { ...(this.limpar(input) as object), updatedBy: user.id } as never,
      });
    });
  }

  async remove(empresaId: string, user: AuthenticatedUser, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
      return tx.vendedor.update({
        where: { id },
        data: { deletedAt: new Date(), deletedBy: user.id, ativo: false },
      });
    });
  }

  /**
   * Cria um Usuario de acesso para o vendedor, com o perfil "Vendedor"
   * (global) e senha provisória enviada por e-mail. Tudo dentro de uma única
   * transação — se o e-mail falhar, a exceção propaga e o Prisma desfaz a
   * criação do usuário/vínculo (não fica usuário órfão sem senha comunicada).
   */
  async criarUsuario(empresaId: string, actorId: string, id: string) {
    return this.prisma.withTenant(
      empresaId,
      async (tx) => {
        const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
        if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
        if (vendedor.usuarioId) {
          throw new ConflictException('Vendedor já possui usuário vinculado');
        }
        if (!vendedor.email) {
          throw new BadRequestException(
            'Cadastre um e-mail para o vendedor antes de criar o usuário',
          );
        }

        const existente = await tx.usuario.findUnique({ where: { email: vendedor.email } });
        if (existente) {
          throw new ConflictException('Já existe um usuário cadastrado com este e-mail');
        }

        const perfilVendedor = await tx.perfil.findFirst({
          where: { nome: 'Vendedor', deletedAt: null },
        });
        if (!perfilVendedor) {
          throw new NotFoundException(
            'Perfil "Vendedor" não encontrado — verifique o cadastro de perfis',
          );
        }

        const senha = await this.politicaSenhaService.gerarSenhaProvisoria();
        const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

        const usuario = await tx.usuario.create({
          data: {
            nome: vendedor.nome,
            email: vendedor.email,
            senhaHash,
            ativo: true,
            deveTrocarSenha: true,
            senhaAlteradaEm: new Date(),
            createdBy: actorId,
            updatedBy: actorId,
            usuarioEmpresas: {
              create: { empresaId, perfilId: perfilVendedor.id, createdBy: actorId, updatedBy: actorId },
            },
          },
        });

        await tx.vendedor.update({
          where: { id },
          data: { usuarioId: usuario.id, updatedBy: actorId },
        });

        await this.mailService.send(
          vendedor.email,
          'Acesso à Plataforma Comercial',
          this.buildSenhaProvisoriaEmailHtml(vendedor.nome, vendedor.email, senha),
        );

        return { id: usuario.id, nome: usuario.nome, email: usuario.email };
      },
      { timeout: 15_000 },
    );
  }

  private buildSenhaProvisoriaEmailHtml(nome: string, email: string, senha: string): string {
    return `
      <p>Olá, ${nome}!</p>
      <p>Foi criado um acesso para você na Plataforma Comercial:</p>
      <ul>
        <li><strong>Login:</strong> ${email}</li>
        <li><strong>Senha provisória:</strong> ${senha}</li>
      </ul>
      <p>Por segurança, você precisará trocar essa senha no primeiro acesso.</p>
    `;
  }

  /**
   * Gera uma nova senha provisória para o usuário já vinculado ao vendedor
   * e reenvia por e-mail — mesmo fluxo de `criarUsuario`, mas para quem já
   * tem acesso e esqueceu/perdeu a senha original.
   */
  async reenviarSenha(empresaId: string, actorId: string, id: string) {
    return this.prisma.withTenant(
      empresaId,
      async (tx) => {
        const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
        if (!vendedor) throw new NotFoundException('Vendedor não encontrado');
        if (!vendedor.usuarioId) {
          throw new BadRequestException('Vendedor não possui usuário de acesso associado');
        }

        const usuario = await tx.usuario.findFirst({
          where: { id: vendedor.usuarioId, deletedAt: null },
        });
        if (!usuario) throw new NotFoundException('Usuário do vendedor não encontrado');
        if (!vendedor.email) {
          throw new BadRequestException(
            'Cadastre um e-mail para o vendedor antes de reenviar a senha',
          );
        }

        const senha = await this.politicaSenhaService.gerarSenhaProvisoria();
        const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

        await this.politicaSenhaService.registrarHistorico(usuario.id, usuario.senhaHash, tx);
        await tx.usuario.update({
          where: { id: usuario.id },
          data: {
            senhaHash,
            senhaAlteradaEm: new Date(),
            deveTrocarSenha: true,
            tentativasFalhas: 0,
            bloqueadoAte: null,
            updatedBy: actorId,
          },
        });

        await this.mailService.send(
          vendedor.email,
          'Nova senha provisória — Plataforma Comercial',
          this.buildSenhaReenviadaEmailHtml(vendedor.nome, vendedor.email, senha),
        );

        return { success: true };
      },
      { timeout: 15_000 },
    );
  }

  private buildSenhaReenviadaEmailHtml(nome: string, email: string, senha: string): string {
    return `
      <p>Olá, ${nome}!</p>
      <p>Sua senha de acesso à Plataforma Comercial foi redefinida:</p>
      <ul>
        <li><strong>Login:</strong> ${email}</li>
        <li><strong>Nova senha provisória:</strong> ${senha}</li>
      </ul>
      <p>Por segurança, você precisará trocar essa senha no primeiro acesso.</p>
    `;
  }

  /**
   * Bloqueia o vendedor (ativo = false). Se houver usuário de acesso
   * vinculado, bloqueia o usuário junto — um vendedor bloqueado não deve
   * continuar conseguindo logar na plataforma.
   */
  async bloquear(empresaId: string, actorId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

      const atualizado = await tx.vendedor.update({
        where: { id },
        data: { ativo: false, updatedBy: actorId },
      });

      if (vendedor.usuarioId) {
        await tx.usuario.update({
          where: { id: vendedor.usuarioId },
          data: { ativo: false, updatedBy: actorId },
        });
      }

      return atualizado;
    });
  }

  /** Reverte o bloqueio: reativa o vendedor e, se houver, o usuário vinculado. */
  async desbloquear(empresaId: string, actorId: string, id: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const vendedor = await tx.vendedor.findFirst({ where: { id, empresaId, deletedAt: null } });
      if (!vendedor) throw new NotFoundException('Vendedor não encontrado');

      const atualizado = await tx.vendedor.update({
        where: { id },
        data: { ativo: true, updatedBy: actorId },
      });

      if (vendedor.usuarioId) {
        await tx.usuario.update({
          where: { id: vendedor.usuarioId },
          data: { ativo: true, updatedBy: actorId },
        });
      }

      return atualizado;
    });
  }
}
