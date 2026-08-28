import { existsSync, unlink } from 'node:fs';
import { basename, join } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ProdutoFotoCriterio,
  ProdutoFotoImportacaoItem,
} from '@plataforma/contracts';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  PRODUTOS_DIR,
  produtoFotoPublicPath,
} from '../../common/uploads/uploads.config';

function nomeSeguro(original: string) {
  return basename(original.replaceAll('\\', '/')).slice(0, 255);
}

export function codigosDoNome(original: string) {
  const nome = nomeSeguro(original);
  const ponto = nome.lastIndexOf('.');
  const base = (ponto > 0 ? nome.slice(0, ponto) : nome).trim();
  const semSufixo = base.replace(/[_ ](?:principal|\d+)$/i, '').trim();
  return [...new Set([base, semSufixo].filter(Boolean))];
}

@Injectable()
export class ProdutoFotosImportacaoService {
  constructor(private readonly prisma: PrismaService) {}

  importar(
    empresaId: string,
    user: AuthenticatedUser,
    criterio: ProdutoFotoCriterio,
    files: Express.Multer.File[],
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const resultado: ProdutoFotoImportacaoItem[] = [];
      for (const file of files) {
        const candidatos = codigosDoNome(file.originalname);
        const campo =
          criterio === 'codigo_erp' ? 'codigoErp' : 'codigoFornecedor';
        let produtos: { id: string; codigoErp: string; descricao: string }[] =
          [];
        if (criterio !== 'manual') {
          // O nome completo tem precedência. Só remove `_2`/` principal`
          // quando não existe uma correspondência exata.
          for (const codigo of candidatos) {
            produtos = await tx.produto.findMany({
              where: {
                empresaId,
                deletedAt: null,
                [campo]: { equals: codigo, mode: 'insensitive' as const },
              },
              select: { id: true, codigoErp: true, descricao: true },
              take: 2,
            });
            if (produtos.length) break;
          }
        }
        const produto = produtos.length === 1 ? produtos[0] : null;
        const ultima = produto
          ? await tx.produtoFoto.findFirst({
              where: { empresaId, produtoId: produto.id },
              orderBy: { ordem: 'desc' },
            })
          : null;
        const foto = await tx.produtoFoto.create({
          data: {
            empresaId,
            produtoId: produto?.id ?? null,
            url: produtoFotoPublicPath(file.filename),
            nomeArquivo: nomeSeguro(file.originalname),
            principal: !!produto && !ultima,
            ordem: produto ? (ultima?.ordem ?? -1) + 1 : 0,
            createdBy: user.id,
          },
        });
        resultado.push({
          ...foto,
          codigoExtraido: candidatos[0] ?? null,
          situacao:
            criterio === 'manual'
              ? ('manual' as const)
              : produtos.length > 1
                ? ('ambiguo' as const)
                : produto
                  ? ('vinculada' as const)
                  : ('sem_correspondencia' as const),
          produto,
        });
      }
      return resultado;
    });
  }

  listarPendentes(empresaId: string) {
    return this.prisma.withTenant(empresaId, (tx) =>
      tx.produtoFoto.findMany({
        where: { empresaId, produtoId: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  vincular(
    empresaId: string,
    user: AuthenticatedUser,
    fotoId: string,
    produtoId: string,
  ) {
    return this.prisma.withTenant(empresaId, async (tx) => {
      const [foto, produto, ultima] = await Promise.all([
        tx.produtoFoto.findFirst({
          where: { id: fotoId, empresaId, produtoId: null },
        }),
        tx.produto.findFirst({
          where: { id: produtoId, empresaId, deletedAt: null },
        }),
        tx.produtoFoto.findFirst({
          where: { empresaId, produtoId },
          orderBy: { ordem: 'desc' },
        }),
      ]);
      if (!foto) throw new NotFoundException('Foto pendente não encontrada');
      if (!produto) throw new NotFoundException('Produto não encontrado');
      return tx.produtoFoto.update({
        where: { id: fotoId },
        data: {
          produtoId,
          principal: !ultima,
          ordem: (ultima?.ordem ?? -1) + 1,
        },
      });
    });
  }

  async removerPendente(empresaId: string, fotoId: string) {
    const foto = await this.prisma.withTenant(empresaId, async (tx) => {
      const encontrada = await tx.produtoFoto.findFirst({
        where: { id: fotoId, empresaId, produtoId: null },
      });
      if (!encontrada)
        throw new NotFoundException('Foto pendente não encontrada');
      await tx.produtoFoto.delete({ where: { id: fotoId } });
      return encontrada;
    });
    const arquivo = join(PRODUTOS_DIR, basename(foto.url));
    if (existsSync(arquivo)) unlink(arquivo, () => undefined);
    return { success: true };
  }
}
