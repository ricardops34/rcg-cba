import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Quanto tempo o resultado vale por empresa: o plano muda raramente, e a rota é chamada a toda requisição. */
const CACHE_MS = 60_000;

/**
 * Quais rotinas **estão fora do plano** contratado pela empresa (SEC-04,
 * auditoria de 27/10/2026).
 *
 * A Estrutura já escondia do menu o que o plano não inclui, mas a API só
 * conferia a permissão do perfil — e o administrador da empresa passa por cima
 * dela. Rota fora do plano continuava respondendo por chamada direta. Disponibilidade
 * **contratual** (o plano) é uma coisa; permissão do **perfil** é outra: as duas
 * precisam valer no servidor.
 *
 * Mesma regra do menu (`EstruturaService.desativadosDaEmpresa`): o plano lista
 * módulos, menus e rotinas; **lista vazia = sem restrição** naquele nível; o que
 * não está na lista, quando ela existe, está fora. Empresa sem assinatura ou sem
 * plano: nada fora (é o caso da própria plataforma).
 *
 * Só o plano entra aqui. O que o administrador da empresa desliga na tela de
 * Estrutura continua valendo pela lista de permissões do token, como sempre:
 * quem liga e desliga é ele.
 */
@Injectable()
export class PlanoDisponibilidadeService {
  private readonly cache = new Map<string, { ate: number; codigos: Set<string> }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Códigos das rotinas (`clientes`, `relatorio-vendas`…) que o plano da empresa não inclui. */
  async rotinasForaDoPlano(empresaId: string): Promise<Set<string>> {
    const guardado = this.cache.get(empresaId);
    if (guardado && guardado.ate > Date.now()) return guardado.codigos;

    const codigos = await this.calcular(empresaId);
    if (this.cache.size > 5_000) this.cache.clear();
    this.cache.set(empresaId, { ate: Date.now() + CACHE_MS, codigos });
    return codigos;
  }

  /** Esquece o que sabe da empresa (mudança de plano na mesma instância da API). */
  esquecer(empresaId?: string) {
    if (empresaId) this.cache.delete(empresaId);
    else this.cache.clear();
  }

  private async calcular(empresaId: string): Promise<Set<string>> {
    // `assinaturas` tem RLS: fora do `withTenant` a consulta volta vazia, e aqui
    // vazio significaria "nada fora do plano" — abriria o que foi fechado.
    return this.prisma.withTenant(empresaId, async (tx) => {
      const assinatura = await tx.assinatura.findFirst({
        where: { grupoEconomico: { empresas: { some: { id: empresaId } } } },
        include: {
          plano: { include: { modulos: true, menus: true, rotinas: true } },
        },
      });
      const plano = assinatura?.plano;
      if (!plano) return new Set<string>();

      const modulos = new Set(plano.modulos.map((m) => m.moduloId));
      const menus = new Set(plano.menus.map((m) => m.menuId));
      const rotinas = new Set(plano.rotinas.map((r) => r.rotinaId));
      if (modulos.size === 0 && menus.size === 0 && rotinas.size === 0) {
        return new Set<string>();
      }

      const catalogo = await tx.rotina.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          codigo: true,
          menu: { select: { id: true, moduloId: true, menuPaiId: true } },
        },
      });

      const fora = new Set<string>();
      for (const rotina of catalogo) {
        const { menu } = rotina;
        const semModulo = modulos.size > 0 && !modulos.has(menu.moduloId);
        const semMenu =
          menus.size > 0 &&
          (!menus.has(menu.id) || (menu.menuPaiId ? !menus.has(menu.menuPaiId) : false));
        const semRotina = rotinas.size > 0 && !rotinas.has(rotina.id);
        if (semModulo || semMenu || semRotina) fora.add(rotina.codigo);
      }
      return fora;
    });
  }
}
