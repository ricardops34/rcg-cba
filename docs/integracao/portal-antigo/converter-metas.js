// Converte o dump do portal antigo (rcgdistc_portal: vendedor, meta_vendedor_mes,
// meta_vendedor_categoria) no arquivo de carga de objetivos da plataforma
// (JSON Lines: {"entidade":"objetivos","registro":{...}}).
//
// Procedimento: docs/runbook-operacao.md, "Carga de objetivos (metas) a partir do portal antigo".
//
// Uso:
//   node converter-metas.js <dump.sql>                     -> só analisa
//   node converter-metas.js <dump.sql> <saida.json> [desde AAAA-MM] [ate AAAA-MM]
//
// Regras:
// - meta ou categoria com dt_delete preenchido fica de fora;
// - mais de uma meta para o mesmo vendedor/mês/ano: fica a alterada por último
//   (dt_alteracao, senão dt_inclusao, senão o maior id);
// - vendedorChave = "-" + vendedor.cod_erp; categoriaChave = "-" + cod_erp
//   (chave FILIAL-COD com filial vazia, como a base da plataforma grava);
// - chave da meta = "<vendedorChave>-<AAAA>-<MM>"; da categoria, "+ -<cod>".
'use strict';
const fs = require('fs');

const [, , arquivo, saida, desde, ate] = process.argv;
if (!arquivo) {
  console.error('uso: node converter-metas.js <dump.sql> [saida.json] [desde AAAA-MM] [ate AAAA-MM]');
  process.exit(1);
}
const sql = fs.readFileSync(arquivo, 'utf8');

/** Linhas de todos os INSERT de uma tabela, como objetos {coluna: valor}. */
function linhas(tabela) {
  const re = new RegExp('INSERT INTO `' + tabela + '` \\(([^)]*)\\) VALUES', 'g');
  const out = [];
  let m;
  while ((m = re.exec(sql))) {
    const colunas = m[1].split(',').map((c) => c.trim().replace(/`/g, ''));
    let i = re.lastIndex;
    // Lê tuplas até o ";" que fecha o INSERT.
    while (i < sql.length) {
      while (/\s|,/.test(sql[i])) i++;
      if (sql[i] === ';') break;
      if (sql[i] !== '(') throw new Error(`esperava "(" em ${tabela}, posição ${i}`);
      i++;
      const valores = [];
      while (true) {
        while (sql[i] === ' ') i++;
        if (sql[i] === "'") {
          let s = '';
          i++;
          while (true) {
            const c = sql[i];
            if (c === '\\') { s += { n: '\n', r: '\r', t: '\t', '0': '\0' }[sql[i + 1]] ?? sql[i + 1]; i += 2; continue; }
            if (c === "'" && sql[i + 1] === "'") { s += "'"; i += 2; continue; }
            if (c === "'") { i++; break; }
            s += c; i++;
          }
          valores.push(s);
        } else {
          let j = i;
          while (sql[j] !== ',' && sql[j] !== ')') j++;
          const bruto = sql.slice(i, j).trim();
          valores.push(bruto === 'NULL' ? null : Number(bruto));
          i = j;
        }
        while (sql[i] === ' ') i++;
        if (sql[i] === ',') { i++; continue; }
        if (sql[i] === ')') { i++; break; }
        throw new Error(`tupla malformada em ${tabela}, posição ${i}`);
      }
      out.push(Object.fromEntries(colunas.map((c, k) => [c, valores[k]])));
    }
    re.lastIndex = i;
  }
  return out;
}

const vendedores = new Map(linhas('vendedor').map((v) => [v.id, v]));
const metas = linhas('meta_vendedor_mes');
const categorias = linhas('meta_vendedor_categoria');

const quando = (r) => r.dt_alteracao || r.dt_inclusao || '';
const periodo = (r) => `${String(r.ano).padStart(4, '0')}-${String(r.mes).padStart(2, '0')}`;

// Uma meta por vendedor/mês/ano.
const excluidas = metas.filter((r) => r.dt_delete);
const porChave = new Map();
let duplicadas = 0;
for (const r of metas) {
  if (r.dt_delete) continue;
  const k = `${r.vendedor_id}|${periodo(r)}`;
  const atual = porChave.get(k);
  if (atual) {
    duplicadas++;
    const maisNova = quando(r) > quando(atual) || (quando(r) === quando(atual) && r.id > atual.id);
    if (!maisNova) continue;
  }
  porChave.set(k, r);
}

const catsPorMeta = new Map();
for (const c of categorias) {
  if (c.dt_delete) continue;
  if (!catsPorMeta.has(c.meta_vendedor_mes_id)) catsPorMeta.set(c.meta_vendedor_mes_id, []);
  catsPorMeta.get(c.meta_vendedor_mes_id).push(c);
}

const semVendedor = new Map();
const registros = [];
for (const r of porChave.values()) {
  const p = periodo(r);
  if (desde && p < desde) continue;
  if (ate && p > ate) continue;
  const v = vendedores.get(r.vendedor_id);
  if (!v || !v.cod_erp) {
    semVendedor.set(r.vendedor_id, (semVendedor.get(r.vendedor_id) ?? 0) + 1);
    continue;
  }
  const vendedorChave = `-${v.cod_erp.trim()}`;
  const chave = `${vendedorChave}-${p}`;
  // Categoria repetida na mesma meta: fica a alterada por último.
  const cats = new Map();
  for (const c of catsPorMeta.get(r.id) ?? []) {
    const cod = String(c.cod_erp ?? '').trim();
    if (!cod) continue;
    const atual = cats.get(cod);
    if (!atual || quando(c) > quando(atual) || (quando(c) === quando(atual) && c.id > atual.id)) cats.set(cod, c);
  }
  registros.push({
    chave,
    vendedorChave,
    mes: Number(r.mes),
    ano: Number(r.ano),
    valor: r.valor ?? 0,
    numeroCliente: r.numero_cliente,
    novoCliente: r.novo_cliente,
    tipo: r.tipo || null,
    ativo: true,
    categorias: [...cats.entries()].map(([cod, c]) => ({
      chave: `${chave}-${cod}`,
      categoriaChave: `-${cod}`,
      valor: c.valor ?? 0,
    })),
  });
}

// Análise
const porAno = {};
for (const r of registros) porAno[r.ano] = (porAno[r.ano] ?? 0) + 1;
const periodos = registros.map((r) => `${r.ano}-${String(r.mes).padStart(2, '0')}`).sort();
console.log(`vendedores no dump: ${vendedores.size}`);
console.log(`metas no dump: ${metas.length} (excluídas: ${excluidas.length}, duplicadas descartadas: ${duplicadas})`);
console.log(`categorias no dump: ${categorias.length} (excluídas: ${categorias.filter((c) => c.dt_delete).length})`);
console.log(`metas na carga${desde || ate ? ` (${desde ?? '...'} a ${ate ?? '...'})` : ''}: ${registros.length}`);
console.log(`  período: ${periodos[0]} a ${periodos[periodos.length - 1]}`);
console.log(`  por ano: ${JSON.stringify(porAno)}`);
console.log(`  com divisão por categoria: ${registros.filter((r) => r.categorias.length).length}`);
console.log(`  vendedores distintos: ${new Set(registros.map((r) => r.vendedorChave)).size}`);
if (semVendedor.size) console.log(`metas sem vendedor com cod_erp (de fora): ${JSON.stringify(Object.fromEntries(semVendedor))}`);
console.log(`códigos de categoria usados: ${[...new Set(registros.flatMap((r) => r.categorias.map((c) => c.categoriaChave)))].sort().join(' ')}`);
console.log(`vendedorChave usados: ${[...new Set(registros.map((r) => r.vendedorChave))].sort().join(' ')}`);

if (saida) {
  fs.writeFileSync(
    saida,
    registros.map((registro) => JSON.stringify({ entidade: 'objetivos', registro })).join('\n') + '\n',
  );
  console.log(`gravado: ${saida}`);
}
