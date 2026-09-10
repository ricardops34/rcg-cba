// Executar na raiz: node scripts/validar-tours.cjs
// Valida o catálogo sem iniciar a API nem gravar execuções de tours.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const src = path.join(root, "apps/web/src");
const cache = new Map();
function carregar(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const { outputText } = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const requireLocal = (id) => {
    assert.ok(id.startsWith("."), `Import inesperado no catálogo: ${id}`);
    return carregar(path.resolve(path.dirname(file), `${id}.ts`));
  };
  new Function("require", "module", "exports", outputText)(requireLocal, module, module.exports);
  return module.exports;
}

const { tourPorRota } = carregar(path.join(src, "lib/tours/tour-definicoes.ts"));
const { ajudaPorRota, ajudaPorCodigo } = carregar(path.join(src, "lib/ajuda-rotinas.ts"));
const { ROTINAS_GUIADAS } = carregar(path.join(src, "lib/tours/rotinas-modulos.ts"));

function paginas(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const file = path.join(dir, item.name);
    return item.isDirectory() ? paginas(file) : item.name === "page.tsx" ? [file] : [];
  });
}

// Inclui os componentes locais usados pela página, para validar os pontos
// compartilhados sem exigir que cada página replique a marcação.
function fontesDaPagina(file, visitados = new Set()) {
  if (visitados.has(file)) return "";
  visitados.add(file);
  const texto = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, texto, ts.ScriptTarget.Latest, true);
  const dependencias = ast.statements.filter(ts.isImportDeclaration).flatMap((node) => {
    const id = node.moduleSpecifier.text;
    const base = id.startsWith("@/") ? path.join(src, id.slice(2))
      : id.startsWith(".") ? path.resolve(path.dirname(file), id) : null;
    if (!base) return [];
    const alvo = [base + ".tsx", base + ".ts", path.join(base, "index.tsx")].find(fs.existsSync);
    return alvo ? [fontesDaPagina(alvo, visitados)] : [];
  });
  return [texto, ...dependencias].join("\n");
}

const codigos = new Set();
for (const rotina of ROTINAS_GUIADAS) {
  assert.ok(!codigos.has(rotina.codigo), `Código repetido: ${rotina.codigo}`);
  codigos.add(rotina.codigo);
}

let total = 0;
const app = path.join(src, "app/(app)");
for (const modulo of ["comercial", "crm", "gerencial", "consultas"]) {
  for (const file of paginas(path.join(app, modulo))) {
    const rota = "/" + path.relative(app, path.dirname(file)).split(path.sep).join("/").replace("[id]", "registro-teste");
    const tour = tourPorRota(rota);
    assert.ok(tour, `Página sem tour: ${rota}`);
    const ajuda = ajudaPorRota(rota);
    assert.ok(ajuda && ajudaPorCodigo(ajuda.codigo), `Página sem ajuda: ${rota}`);
    const nova = ROTINAS_GUIADAS.find((r) => r.codigo === tour.codigo);
    if (nova) {
      assert.equal(ajuda.codigo, tour.codigo, `Ajuda incorreta: ${rota}`);
      const fontes = fontesDaPagina(file);
      for (const seletor of [tour.seletorPronto, ...tour.passos.map((p) => p.seletor)].filter(Boolean)) {
        for (const [, atributo, valor] of seletor.matchAll(/\[(data-tour|data-slot|for)="([^"]+)"\]/g)) {
          const prop = atributo === "for" ? "htmlFor" : atributo;
          assert.ok(fontes.includes(`${prop}="${valor}"`), `Alvo ausente em ${rota}: ${seletor}`);
        }
      }
    }
    total++;
  }
}

// As rotas fixas não podem cair no tour de detalhe por prefixo.
for (const [rota, codigo] of [
  ["/crm/atividades/novo", "atividade-novo"],
  ["/crm/oportunidades/novo", "oportunidade-novo"],
  ["/gerencial/objetivos/novo", "objetivo-novo"],
  ["/gerencial/vendedores/novo", "vendedor-novo"],
  ["/comercial/produtos/fotos", "produtos-fotos"],
  ["/comercial/produtos/fichas", "produtos-fichas"],
]) assert.equal(tourPorRota(rota).codigo, codigo);
assert.equal(tourPorRota("/crm/atividades-outra"), null);
assert.equal(ajudaPorRota("/crm/atividades-outra"), null);
console.log(`OK: ${total} páginas com tour e ajuda; ${codigos.size} novos tours com códigos e alvos verificados.`);
