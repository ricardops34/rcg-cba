import { once } from 'node:events';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import archiver from 'archiver';
import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  chaveDoEndereco,
  type Armazenamento,
} from '../../common/armazenamento/armazenamento';
import {
  ARQUIVOS_POR_NOME,
  CAMPOS_MASCARADOS,
  ESPECIAIS,
  FORA,
  PARAMETROS_SECRETOS,
  camposDaChave,
  camposEscalares,
  delegate,
  modelPorNome,
  modelsDaEmpresa,
  tabela,
  type ModelDoBackup,
} from './backup-catalogo';
import {
  CSV_BOM,
  cabecalhoCsv,
  linhaCsv,
  linhaJson,
} from './backup-serializar';

/** Linhas lidas por consulta. */
const PAGINA = 1000;

/** Versão do formato do pacote — muda se a estrutura do zip mudar. */
export const VERSAO_FORMATO = 1;

export interface ResultadoGeracao {
  caminhoZip: string;
  bytes: number;
  registros: number;
  arquivos: number;
}

type Registro = Record<string, unknown>;
type Delegate = { findMany: (args: unknown) => Promise<Registro[]> };

const LEIA_ME = `Backup de empresa — Plataforma

dados/       Uma linha JSON por registro, por tabela. É o que a restauração lê.
planilhas/   O mesmo conteúdo em CSV (separador ";"), para abrir no Excel.
arquivos/    Os arquivos que os registros referenciam (mídia do WhatsApp,
             fichas técnicas, fotos, logos), na mesma pasta em que ficam
             na plataforma.
manifesto.json  Empresa, data, versão do sistema e a contagem de cada tabela.

Ficaram de fora, de propósito: senhas, tokens e chaves de acesso (vão vazios),
e os cadastros que são da plataforma e não da empresa (municípios, CNAE,
menus, perfis). A lista e o motivo estão em manifesto.json → "fora".
`;

/**
 * Monta o zip de uma empresa num diretório temporário. Quem chama grava o zip
 * no armazenamento e apaga o temporário (`BackupEmpresaService`).
 *
 * Toda leitura passa por `withTenant(empresaId)` **e** filtra por
 * `empresaId` em código: a RLS garante que nada de outra empresa entra, e o
 * filtro cobre as poucas tabelas com `empresaId` sem RLS (sessões, chaves de
 * API, logs de acesso — ver prisma/migrations/README.md).
 */
export class BackupGerador {
  private registros = 0;
  private readonly contagem: Record<string, number> = {};
  private readonly arquivosReferenciados = new Set<string>();
  private readonly usuarioIds = new Set<string>();
  /** O grupo para o qual a linha da empresa aponta. */
  private grupoId: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly armazenamento: Armazenamento,
    private readonly empresaId: string,
    private readonly pastaTemporaria: string,
    /** Sem compressão — só o teste usa, para ler o conteúdo do zip. */
    private readonly semCompressao = false,
  ) {}

  async gerar(info: {
    versaoSchema: string;
    geradoEm: Date;
    origem: string;
  }): Promise<ResultadoGeracao> {
    await mkdir(this.pastaTemporaria, { recursive: true });
    const caminhoZip = join(this.pastaTemporaria, 'pacote.zip');
    const saida = createWriteStream(caminhoZip);
    const zip = archiver(
      'zip',
      this.semCompressao ? { store: true } : { zlib: { level: 6 } },
    );
    const fechou = once(saida, 'close');
    const erroZip = new Promise<never>((_, rejeitar) =>
      zip.on('error', rejeitar),
    );
    zip.pipe(saida);

    const trabalho = (async () => {
      // `usuario_empresas` primeiro: é dela que saem os usuários (especial).
      const daEmpresa = modelsDaEmpresa().sort((a, b) =>
        a.name === 'UsuarioEmpresa' ? -1 : b.name === 'UsuarioEmpresa' ? 1 : 0,
      );
      for (const m of daEmpresa) {
        await this.exportarTabela(zip, m, { empresaId: this.empresaId });
      }

      const empresa = await this.exportarTabela(zip, modelPorNome('Empresa'), {
        id: this.empresaId,
      });
      const grupoId = empresa[0]?.grupoEconomicoId as string | undefined;
      this.grupoId = grupoId;
      if (grupoId)
        await this.exportarTabela(zip, modelPorNome('GrupoEconomico'), {
          id: grupoId,
        });
      await this.exportarTabela(zip, modelPorNome('Usuario'), {
        id: { in: [...this.usuarioIds] },
      });

      const ausentes = await this.juntarArquivos(zip);

      const manifesto = {
        formato: VERSAO_FORMATO,
        empresaId: this.empresaId,
        geradoEm: info.geradoEm.toISOString(),
        origem: info.origem,
        versaoSchema: info.versaoSchema,
        registros: this.registros,
        tabelas: this.contagem,
        arquivos: this.arquivosReferenciados.size - ausentes.length,
        arquivosAusentes: ausentes,
        mascarados: {
          campos: CAMPOS_MASCARADOS,
          parametros: PARAMETROS_SECRETOS,
        },
        especiais: ESPECIAIS,
        fora: FORA,
      };
      zip.append(JSON.stringify(manifesto, null, 2), {
        name: 'manifesto.json',
      });
      zip.append(LEIA_ME, { name: 'LEIA-ME.txt' });
      await zip.finalize();
      await fechou;
      return manifesto.arquivos;
    })();

    const arquivos = await Promise.race([trabalho, erroZip]);
    const { size } = await stat(caminhoZip);
    return { caminhoZip, bytes: size, registros: this.registros, arquivos };
  }

  /**
   * Lê a tabela em páginas pela chave primária e escreve o JSONL e o CSV em
   * arquivos temporários, que entram no zip. Devolve as linhas só das tabelas
   * pequenas que o chamador precisa (a empresa).
   */
  private async exportarTabela(
    zip: archiver.Archiver,
    m: ModelDoBackup,
    where: Registro,
  ) {
    const campos = camposEscalares(m).map((f) => f.name);
    const chave = camposDaChave(m);
    const nome = tabela(m);
    const jsonl = join(this.pastaTemporaria, `${nome}.jsonl`);
    const csv = join(this.pastaTemporaria, `${nome}.csv`);
    const outJson = createWriteStream(jsonl);
    const outCsv = createWriteStream(csv);
    await escrever(outCsv, CSV_BOM + cabecalhoCsv(campos) + '\n');

    const guardar: Registro[] = [];
    let total = 0;
    for (let pular = 0; ; pular += PAGINA) {
      const pagina = await this.prisma.withTenant(this.empresaId, (tx) =>
        (tx as unknown as Record<string, Delegate>)[delegate(m.name)].findMany({
          where,
          orderBy: chave.map((c) => ({ [c]: 'asc' })),
          skip: pular,
          take: PAGINA,
        }),
      );
      for (const r of pagina) {
        this.conferirDono(m, r);
        const limpo = this.limpar(m, r);
        this.observar(m, limpo);
        await escrever(outJson, linhaJson(limpo, campos) + '\n');
        await escrever(outCsv, linhaCsv(limpo, campos) + '\n');
        if (m.name === 'Empresa') guardar.push(limpo);
      }
      total += pagina.length;
      if (pagina.length < PAGINA) break;
    }
    outJson.end();
    outCsv.end();
    await Promise.all([once(outJson, 'close'), once(outCsv, 'close')]);

    zip.file(jsonl, { name: `dados/${nome}.jsonl` });
    zip.file(csv, { name: `planilhas/${nome}.csv` });
    this.contagem[nome] = total;
    this.registros += total;
    return guardar;
  }

  /**
   * Última barreira contra dado de outra empresa no pacote: cada registro é
   * conferido antes de ser escrito, e um só fora do lugar **derruba o
   * backup** em vez de entregá-lo. A RLS e o `where` já impedem — isto pega
   * o dia em que um dos dois falhar (policy esquecida numa tabela nova,
   * filtro trocado num refactor).
   */
  private conferirDono(m: ModelDoBackup, r: Registro) {
    const dono =
      m.name === 'Empresa'
        ? r.id === this.empresaId
        : m.name === 'GrupoEconomico'
          ? !!this.grupoId && r.id === this.grupoId
          : m.name === 'Usuario'
            ? this.usuarioIds.has(r.id as string)
            : r.empresaId === this.empresaId;
    if (!dono) {
      throw new Error(
        `Registro fora da empresa no backup (${m.name}, id ${String(r.id)}): pacote descartado.`,
      );
    }
  }

  /** Tira credenciais: campos mascarados e parâmetros secretos vão vazios. */
  private limpar(m: ModelDoBackup, r: Registro): Registro {
    const mascarar = CAMPOS_MASCARADOS[m.name];
    const secreto =
      m.name === 'ParametroEmpresa' &&
      PARAMETROS_SECRETOS.includes(r.parametro as string);
    if (!mascarar && !secreto) return r;
    const copia = { ...r };
    for (const c of mascarar ?? []) copia[c] = null;
    if (secreto) copia.conteudo = null;
    return copia;
  }

  /** Anota os arquivos referenciados e os usuários vinculados. */
  private observar(m: ModelDoBackup, r: Registro) {
    if (m.name === 'UsuarioEmpresa' && typeof r.usuarioId === 'string') {
      this.usuarioIds.add(r.usuarioId);
    }
    for (const valor of Object.values(r)) {
      if (typeof valor !== 'string' || !valor.startsWith('/uploads/')) continue;
      const chave = chaveDoEndereco(valor);
      if (chave) this.arquivosReferenciados.add(chave);
    }
    for (const [campo, pasta] of Object.entries(
      ARQUIVOS_POR_NOME[m.name] ?? {},
    )) {
      const nome = r[campo];
      if (typeof nome === 'string' && nome && !nome.includes('/')) {
        this.arquivosReferenciados.add(`${pasta}/${nome}`);
      }
    }
  }

  /**
   * Põe os arquivos no zip, um de cada vez: do disco em stream; do S3, lido
   * inteiro (a mídia do WhatsApp tem teto de 16 MB). Espera cada entrada ser
   * processada antes da próxima, senão o archiver enfileiraria todos na
   * memória.
   */
  private async juntarArquivos(zip: archiver.Archiver) {
    const ausentes: string[] = [];
    for (const chave of [...this.arquivosReferenciados].sort()) {
      const noDisco = await this.armazenamento
        .caminhoNoDisco(chave)
        .catch(() => null);
      const conteudo = noDisco
        ? null
        : await this.armazenamento.ler(chave).catch(() => null);
      if (!noDisco && !conteudo) {
        ausentes.push(chave);
        continue;
      }
      const processado = once(zip, 'entry');
      if (noDisco) zip.file(noDisco, { name: `arquivos/${chave}` });
      else zip.append(conteudo!, { name: `arquivos/${chave}` });
      await processado;
    }
    return ausentes;
  }
}

async function escrever(saida: WriteStream, texto: string) {
  if (!saida.write(texto)) await once(saida, 'drain');
}

export async function apagarTemporario(pasta: string) {
  await rm(pasta, { recursive: true, force: true });
}
