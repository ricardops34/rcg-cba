import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { PortalClienteConfig, PortalClienteContatoCreate } from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import { whereEmpresaAcessivel } from '../../common/empresa/situacao-empresa';

const ACOES: Record<string, string[]> = {
  cadastro: ['visualizar', 'editar'],
  contatos: ['visualizar', 'cadastrar', 'editar'],
  notas: ['visualizar', 'segunda-via'],
  compras: ['visualizar'],
  titulos: ['visualizar', 'segunda-via'],
  orcamentos: ['visualizar', 'aprovar', 'recusar'],
  catalogo: ['visualizar'],
  carrinho: ['visualizar', 'comprar'],
};

@Injectable()
export class PortalClienteAdminService {
  constructor(private readonly prisma: PrismaService) {}

  obterConfig(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.portalClienteConfig.findUnique({ where: { empresaId } }),
    );
  }

  salvarConfig(empresaId: string, input: PortalClienteConfig, usuarioId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.portalClienteConfig.upsert({
        where: { empresaId },
        create: { empresaId, ...input },
        update: input,
      }),
    );
  }

  async criarAcesso(empresaId: string, input: PortalClienteContatoCreate, usuarioId: string) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [empresa, cliente] = await Promise.all([
        tx.empresa.findFirst({
          where: { id: empresaId, deletedAt: null, ...whereEmpresaAcessivel() },
        }),
        tx.cliente.findFirst({ where: { id: input.clienteId, empresaId, ativo: true, deletedAt: null } }),
      ]);
      if (!empresa?.alias) throw new ConflictException('Defina o alias da empresa antes de liberar o portal');
      if (!cliente) throw new NotFoundException('Cliente não encontrado');

      let perfilId = input.perfilId;
      if (!perfilId) {
        const perfil = await tx.portalClientePerfil.upsert({
          where: { empresaId_nome: { empresaId, nome: 'Administrador do cliente' } },
          create: {
            empresaId,
            nome: 'Administrador do cliente',
            descricao: 'Acesso padrão com todas as rotinas do portal',
            sistemaBase: true,
            createdBy: usuarioId,
            updatedBy: usuarioId,
          },
          update: { ativo: true, updatedBy: usuarioId },
        });
        perfilId = perfil.id;
        const rotinas = await tx.portalClienteRotina.findMany({ where: { ativo: true } });
        if (!rotinas.length) {
          throw new ConflictException(
            'Catálogo de rotinas do portal vazio — aplique as migrations antes de liberar o acesso',
          );
        }
        await tx.portalClientePerfilPermissao.createMany({
          data: rotinas.flatMap((rotina) =>
            (ACOES[rotina.codigo] ?? ['visualizar']).map((acao) => ({
              empresaId,
              perfilId: perfil.id,
              rotinaId: rotina.id,
              acao,
              permitido: true,
            })),
          ),
          skipDuplicates: true,
        });
      } else {
        const perfil = await tx.portalClientePerfil.findFirst({ where: { id: perfilId, empresaId, ativo: true } });
        if (!perfil) throw new NotFoundException('Perfil do portal não encontrado');
      }

      const emailNormalizado = input.email.trim().toLowerCase();
      // O cadastro do cliente já tem os contatos: liberar acesso é dar perfil e
      // credencial a quem já está lá, não cadastrar de novo — a unique
      // (empresaId, clienteId, email) recusaria o segundo registro. O e-mail
      // gravado no contato fica como está; quem normaliza é a credencial.
      const existente = await tx.clienteContato.findFirst({
        where: {
          empresaId,
          clienteId: input.clienteId,
          email: { equals: emailNormalizado, mode: 'insensitive' },
        },
      });
      const dados = {
        perfilId,
        nome: input.nome,
        telefone: input.telefone,
        celular: input.celular,
        cargo: input.cargo,
        principal: input.principal,
        ativo: input.ativo,
        updatedBy: usuarioId,
      };
      const contato = existente
        ? await tx.clienteContato.update({
            where: { id: existente.id },
            data: dados,
          })
        : await tx.clienteContato.create({
            data: {
              empresaId,
              clienteId: input.clienteId,
              email: emailNormalizado,
              createdBy: usuarioId,
              ...dados,
            },
          });

      const empresaAlias = empresa.alias.toLowerCase();
      const credencialExistente = await tx.portalClienteCredencial.findFirst({
        where: {
          OR: [{ contatoId: contato.id }, { empresaAlias, emailNormalizado }],
        },
      });
      if (credencialExistente) {
        throw new ConflictException('Este contato já tem acesso ao portal');
      }

      await tx.portalClienteHabilitacao.upsert({
        where: { clienteId: input.clienteId },
        create: { empresaId, clienteId: input.clienteId, ativo: true },
        update: { ativo: true },
      });
      await tx.portalClienteConfig.upsert({
        where: { empresaId },
        create: { empresaId, ativo: true },
        update: {},
      });
      await tx.portalClienteCredencial.create({
        data: {
          empresaId,
          contatoId: contato.id,
          empresaAlias,
          emailNormalizado,
          senhaHash: await bcrypt.hash(input.senhaInicial, 12),
          ativo: input.ativo,
        },
      });
      return {
        id: contato.id,
        nome: contato.nome,
        email: contato.email,
        perfilId,
        ativo: contato.ativo,
        contatoExistente: Boolean(existente),
      };
    });
  }
}
