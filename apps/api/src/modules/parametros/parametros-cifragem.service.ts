import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  VARIAVEL_CHAVE_PARAMETROS,
  cifrarParametro,
  estaCifrado,
} from './parametros-cripto';

/**
 * Na subida da API, cifra os parâmetros de tipo `senha` que ainda estão em
 * texto puro — gravados antes de 2026-10-15, quando a cifragem entrou (decisão
 * do usuário: cifrar os existentes na subida, não esperar alguém salvar de
 * novo).
 *
 * Sem a chave mestra não faz nada além de avisar: a leitura aceita texto puro,
 * então nada quebra, e cifrar sem a chave não é possível.
 *
 * Idempotente e seguro com mais de uma instância: só toca o que não tem o
 * prefixo, e a escrita é condicionada ao valor lido (`updateMany` com o
 * conteúdo antigo no `where`), para duas instâncias não cifrarem duas vezes.
 */
@Injectable()
export class ParametrosCifragemService implements OnModuleInit {
  private readonly logger = new Logger(ParametrosCifragemService.name);

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.cifrarExistentes().catch((erro) =>
      this.logger.error(
        `Cifragem dos parâmetros de senha na subida: ${String(erro)}`,
      ),
    );
  }

  async cifrarExistentes(env = process.env): Promise<number> {
    if (!env[VARIAVEL_CHAVE_PARAMETROS]) {
      this.logger.warn(
        `${VARIAVEL_CHAVE_PARAMETROS} não configurada: os parâmetros de senha seguem em texto puro, e salvar a senha do e-mail ou o token do SMS será recusado.`,
      );
      return 0;
    }

    // Empresas: RLS por grupo — o modo sistema vê todas, inclusive as
    // excluídas, que ainda têm parâmetros gravados. Operação da própria API,
    // sem usuário.
    const empresas = await this.prisma.withSistema((tx) =>
      tx.empresa.findMany({ select: { id: true } }),
    );

    let cifrados = 0;
    for (const { id } of empresas) {
      cifrados += await this.prisma.withTenant(id, async (tx) => {
        const emClaro = await tx.parametroEmpresa.findMany({
          where: { empresaId: id, tipo: 'senha', conteudo: { not: null } },
          select: { id: true, conteudo: true },
        });
        let n = 0;
        for (const p of emClaro) {
          if (!p.conteudo || estaCifrado(p.conteudo)) continue;
          const { count } = await tx.parametroEmpresa.updateMany({
            where: { id: p.id, conteudo: p.conteudo },
            data: { conteudo: cifrarParametro(p.conteudo) },
          });
          n += count;
        }
        return n;
      });
    }
    if (cifrados > 0) {
      this.logger.log(`Parâmetros de senha cifrados na subida: ${cifrados}.`);
    }
    return cifrados;
  }
}
