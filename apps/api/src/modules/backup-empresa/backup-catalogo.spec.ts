import {
  CAMPOS_MASCARADOS,
  ESPECIAIS,
  FORA,
  NAO_SAO_SEGREDO,
  PARECE_SEGREDO,
  camposDaChave,
  camposEscalares,
  modelPorNome,
  modelsDaEmpresa,
  temEmpresaId,
  todosOsModels,
} from './backup-catalogo';

describe('catálogo do backup por empresa', () => {
  it('todo model do schema está decidido: entra por empresaId, é especial ou está fora com motivo', () => {
    const semDecisao = todosOsModels().filter((nome) => {
      if (nome in ESPECIAIS || nome in FORA) return false;
      return !temEmpresaId(modelPorNome(nome));
    });
    // Model novo sem empresaId: decida se entra (ESPECIAIS) ou não (FORA).
    expect(semDecisao).toEqual([]);
  });

  it('nada está em duas listas, e as listas só citam models que existem', () => {
    const todos = new Set(todosOsModels());
    for (const nome of [...Object.keys(ESPECIAIS), ...Object.keys(FORA)]) {
      expect(todos.has(nome)).toBe(true);
    }
    for (const nome of Object.keys(ESPECIAIS)) expect(nome in FORA).toBe(false);
  });

  it('todo campo de texto com cara de segredo nos models que entram vai mascarado (ou está liberado)', () => {
    const entram = [
      ...modelsDaEmpresa(),
      ...Object.keys(ESPECIAIS).map(modelPorNome),
    ];
    const descobertos: string[] = [];
    for (const m of entram) {
      for (const f of camposEscalares(m)) {
        if (
          !['String', 'Bytes'].includes(f.type) ||
          !PARECE_SEGREDO.test(f.name)
        )
          continue;
        const mascarado = CAMPOS_MASCARADOS[m.name]?.includes(f.name);
        const liberado = NAO_SAO_SEGREDO[m.name]?.includes(f.name);
        if (!mascarado && !liberado) descobertos.push(`${m.name}.${f.name}`);
      }
    }
    // Campo novo de credencial: ponha em CAMPOS_MASCARADOS (ou em NAO_SAO_SEGREDO, se não for).
    expect(descobertos).toEqual([]);
  });

  it('os campos mascarados existem', () => {
    for (const [nome, campos] of Object.entries(CAMPOS_MASCARADOS)) {
      const existentes = camposEscalares(modelPorNome(nome)).map((f) => f.name);
      for (const c of campos) expect(existentes).toContain(c);
    }
  });

  it('todo model que entra tem chave primária para a leitura em páginas', () => {
    for (const m of modelsDaEmpresa())
      expect(camposDaChave(m).length).toBeGreaterThan(0);
  });

  it('as tabelas de negócio grandes entram', () => {
    const nomes = modelsDaEmpresa().map((m) => m.name);
    for (const n of [
      'Cliente',
      'NotaSaida',
      'TituloReceber',
      'WhatsappMensagem',
      'ParametroEmpresa',
    ]) {
      expect(nomes).toContain(n);
    }
    expect(nomes).not.toContain('RefreshToken');
    expect(nomes).not.toContain('EmpresaBackup');
  });
});
