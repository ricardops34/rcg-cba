import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Perfil tem dono (migration 20260930200000_perfil_por_grupo): a plataforma
 * (`grupoEconomicoId` nulo) ou um grupo econômico. `perfis` não tem RLS — é lida
 * no login, antes de haver empresa ativa —, então o corte entre grupos é este
 * código. Quem atribui perfil a um vínculo passa por `garantirPerfilDoGrupo`.
 */
export async function grupoDaEmpresa(db: Db, empresaId: string): Promise<string | null> {
  const empresa = await db.empresa.findUnique({
    where: { id: empresaId },
    select: { grupoEconomicoId: true },
  });
  return empresa?.grupoEconomicoId ?? null;
}

/**
 * Recusa um perfil de outro grupo. Vale também para o administrador da
 * plataforma: um vínculo da empresa X com o perfil do grupo de Y não tem
 * sentido para ninguém, e o administrador de Y passaria a mandar nas
 * permissões de um usuário de X.
 */
export async function garantirPerfilDoGrupo(db: Db, perfilId: string, empresaId: string) {
  const perfil = await db.perfil.findFirst({
    where: { id: perfilId, deletedAt: null },
    select: { grupoEconomicoId: true },
  });
  if (!perfil) throw new BadRequestException('Perfil não encontrado');
  if (perfil.grupoEconomicoId === null) return;
  if (perfil.grupoEconomicoId !== (await grupoDaEmpresa(db, empresaId))) {
    throw new ForbiddenException('Este perfil pertence a outro grupo econômico');
  }
}

/** `garantirPerfilDoGrupo` para uma lista (destino de comunicado, ferramenta do agente). */
export async function garantirPerfisDoGrupo(db: Db, perfilIds: string[], empresaId: string) {
  if (perfilIds.length === 0) return;
  const grupo = await grupoDaEmpresa(db, empresaId);
  const aceitos = await db.perfil.count({
    where: {
      id: { in: [...new Set(perfilIds)] },
      deletedAt: null,
      OR: [{ grupoEconomicoId: null }, ...(grupo ? [{ grupoEconomicoId: grupo }] : [])],
    },
  });
  if (aceitos !== new Set(perfilIds).size) {
    throw new BadRequestException('Perfil não encontrado neste grupo econômico');
  }
}

/**
 * Empresa que muda de grupo leva os perfis de grupo que usa: para cada perfil
 * do grupo antigo, o novo grupo usa o dele com o mesmo nome ou recebe uma
 * cópia, com as permissões. Sem isso os usuários da empresa continuariam em
 * perfis que o administrador do grupo antigo edita.
 *
 * Em duas fases por causa da RLS de `perfis`, que só mostra o grupo da empresa
 * informada na transação (`app.current_empresa_id` = `empresaId`):
 *
 * 1. `planejarPerfisParaGrupo`, **antes** de a empresa mudar de grupo — lê os
 *    perfis do grupo antigo, que ainda é o dela;
 * 2. `aplicarPerfisNoGrupo`, **depois** — o grupo dela já é o de destino, e é
 *    nele que a cópia é gravada.
 */
export type PlanoDePerfis = Awaited<ReturnType<typeof planejarPerfisParaGrupo>>;

export async function planejarPerfisParaGrupo(
  tx: Prisma.TransactionClient,
  empresaId: string,
  grupoDestinoId: string,
) {
  const [vinculos, ferramentas, comunicados] = await Promise.all([
    // Perfil é do usuário: os de quem tem acesso a esta empresa.
    tx.usuario.findMany({ where: { usuarioEmpresas: { some: { empresaId } } }, select: { perfilId: true } }),
    tx.agenteFerramentaPerfil.findMany({ where: { empresaId }, select: { perfilId: true } }),
    tx.comunicadoPerfil.findMany({ where: { empresaId }, select: { perfilId: true } }),
  ]);
  const ids = [...new Set([...vinculos, ...ferramentas, ...comunicados].map((l) => l.perfilId))];
  return tx.perfil.findMany({
    where: {
      id: { in: ids },
      grupoEconomicoId: { not: null },
      NOT: { grupoEconomicoId: grupoDestinoId },
    },
    include: { permissoes: true },
  });
}

export async function aplicarPerfisNoGrupo(
  tx: Prisma.TransactionClient,
  empresaId: string,
  grupoDestinoId: string,
  plano: PlanoDePerfis,
  actorId: string,
) {
  for (const origem of plano) {
    // O nome é único por grupo, contando os excluídos: um excluído com o
    // mesmo nome é reaproveitado em vez de colidir.
    const existente = await tx.perfil.findUnique({
      where: { grupoEconomicoId_nome: { grupoEconomicoId: grupoDestinoId, nome: origem.nome } },
      select: { id: true, deletedAt: true },
    });
    let destinoId: string;
    if (existente && !existente.deletedAt) {
      destinoId = existente.id;
    } else {
      const dados = {
        descricao: origem.descricao,
        ativo: origem.ativo,
        rotinaInicialId: origem.rotinaInicialId,
        updatedBy: actorId,
      };
      const destino = existente
        ? await tx.perfil.update({
            where: { id: existente.id },
            data: { ...dados, deletedAt: null, deletedBy: null },
          })
        : await tx.perfil.create({
            data: {
              ...dados,
              nome: origem.nome,
              grupoEconomicoId: grupoDestinoId,
              createdBy: actorId,
            },
          });
      destinoId = destino.id;
      await tx.perfilPermissao.deleteMany({ where: { perfilId: destinoId } });
      if (origem.permissoes.length > 0) {
        await tx.perfilPermissao.createMany({
          data: origem.permissoes.map((p) => ({
            perfilId: destinoId,
            rotinaId: p.rotinaId,
            acao: p.acao,
            permitido: p.permitido,
            createdBy: actorId,
            updatedBy: actorId,
          })),
        });
      }
    }

    const de = { empresaId, perfilId: origem.id };
    const para = { perfilId: destinoId };
    await tx.usuario.updateMany({
      where: { perfilId: origem.id, usuarioEmpresas: { some: { empresaId } } },
      data: { ...para, updatedBy: actorId },
    });
    await tx.agenteFerramentaPerfil.updateMany({ where: de, data: para });
    await tx.comunicadoPerfil.updateMany({ where: de, data: para });
  }
}
