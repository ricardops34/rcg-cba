import { gzipSync } from 'node:zlib';
import {
  ArquivoCargaInvalido,
  blocosDoArquivo,
  compactarParaGuardar,
  conferirArquivo,
  descompactar,
  ehGzip,
  linhasDoArquivo,
} from './ler-arquivo-carga';

const linha = (entidade: string, chave: string) =>
  JSON.stringify({ entidade, registro: { chave } });

const arquivo = (...linhas: string[]) => Buffer.from(linhas.join('\n'), 'utf8');

function problemasDe(fn: () => unknown): string[] {
  try {
    fn();
  } catch (erro) {
    if (erro instanceof ArquivoCargaInvalido) return erro.problemas;
    throw erro;
  }
  throw new Error('esperava ArquivoCargaInvalido');
}

describe('descompactar', () => {
  it('abre o gzip e devolve texto puro como veio', () => {
    const texto = arquivo(linha('categorias', '01-1'));
    expect(descompactar(gzipSync(texto)).equals(texto)).toBe(true);
    expect(descompactar(texto).equals(texto)).toBe(true);
  });

  it('recusa gzip corrompido', () => {
    const quebrado = gzipSync(arquivo(linha('categorias', '01-1'))).subarray(
      0,
      12,
    );
    expect(problemasDe(() => descompactar(quebrado))).toEqual([
      'gzip corrompido ou incompleto',
    ]);
  });

  it('guarda sempre compactado', () => {
    const texto = arquivo(linha('categorias', '01-1'));
    expect(ehGzip(compactarParaGuardar(texto))).toBe(true);
    const jaCompactado = gzipSync(texto);
    expect(compactarParaGuardar(jaCompactado)).toBe(jaCompactado);
  });
});

describe('linhasDoArquivo', () => {
  it('ignora BOM, CRLF e linha em branco, mas numera pela posição', () => {
    const texto = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('a\r\n\r\nb\r\n', 'utf8'),
    ]);
    expect([...linhasDoArquivo(texto)]).toEqual([
      { linha: 1, conteudo: 'a' },
      { linha: 3, conteudo: 'b' },
    ]);
  });

  it('retoma depois da linha informada', () => {
    const texto = arquivo('a', 'b', 'c');
    expect([...linhasDoArquivo(texto, 2)]).toEqual([
      { linha: 3, conteudo: 'c' },
    ]);
  });
});

describe('conferirArquivo', () => {
  it('conta as linhas por entidade', () => {
    const texto = arquivo(
      linha('vendedores', '01-1'),
      linha('titulos-receber', '01-A'),
      linha('titulos-receber', '01-B'),
    );
    expect(conferirArquivo(texto)).toEqual({
      totalLinhas: 3,
      entidades: { vendedores: 1, 'titulos-receber': 2 },
    });
  });

  it('recusa o arquivo inteiro e aponta as linhas com problema', () => {
    const texto = arquivo(
      linha('vendedores', '01-1'),
      '{quebrado',
      linha('notas-saida-xml', '01-X'),
      JSON.stringify({ entidade: 'clientes' }),
    );
    expect(problemasDe(() => conferirArquivo(texto))).toEqual([
      'linha 2: não é um JSON válido',
      'linha 3: entidade "notas-saida-xml" não aceita em carga por arquivo',
      'linha 4: "registro" ausente ou não é um objeto',
    ]);
  });

  it('recusa arquivo sem nenhuma linha', () => {
    expect(problemasDe(() => conferirArquivo(arquivo('', '')))).toEqual([
      'arquivo sem nenhuma linha',
    ]);
  });
});

describe('blocosDoArquivo', () => {
  it('fecha o bloco na troca de entidade e no tamanho, sem reordenar', () => {
    const texto = arquivo(
      linha('vendedores', '01-1'),
      linha('vendedores', '01-2'),
      linha('vendedores', '01-3'),
      linha('clientes', '01-C'),
      linha('vendedores', '01-4'),
    );
    const blocos = [...blocosDoArquivo(texto, 0, 2)].map((b) => ({
      entidade: b.entidade,
      linhas: b.linhas.map((l) => l.linha),
      ultimaLinha: b.ultimaLinha,
    }));
    expect(blocos).toEqual([
      { entidade: 'vendedores', linhas: [1, 2], ultimaLinha: 2 },
      { entidade: 'vendedores', linhas: [3], ultimaLinha: 3 },
      { entidade: 'clientes', linhas: [4], ultimaLinha: 4 },
      { entidade: 'vendedores', linhas: [5], ultimaLinha: 5 },
    ]);
  });

  it('retoma depois do checkpoint', () => {
    const texto = arquivo(
      linha('vendedores', '01-1'),
      linha('vendedores', '01-2'),
    );
    const blocos = [...blocosDoArquivo(texto, 1, 1000)];
    expect(blocos).toHaveLength(1);
    expect(blocos[0].linhas.map((l) => l.registro.chave)).toEqual(['01-2']);
  });
});
