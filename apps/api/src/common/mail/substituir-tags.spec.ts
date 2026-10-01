import { substituirTags, formatarTextoHtml } from './substituir-tags';

describe('substituirTags', () => {
  it('substitui tags de cliente, empresa, colaborador e documento', () => {
    const template =
      'Olá {{cliente.nome}}, segue a NF {{nota.numero}} emitida por {{empresa.nomeFantasia}}. Atte, {{colaborador.nome}} ({{colaborador.cargo}}).';

    const resultado = substituirTags(template, {
      cliente: { nome: 'Mercado Central' },
      nota: { numero: '117179' },
      empresa: { nomeFantasia: 'RCG Distribuidora' },
      colaborador: { nome: 'Ricardo', cargo: 'Comercial' },
    });

    expect(resultado).toBe(
      'Olá Mercado Central, segue a NF 117179 emitida por RCG Distribuidora. Atte, Ricardo (Comercial).',
    );
  });

  it('suporta espaços dentro das chaves duplas {{ tag }}', () => {
    const template = 'NF {{  nota.numero  }} - {{   cliente.nome   }}';
    const resultado = substituirTags(template, {
      cliente: { nome: 'Cliente Teste' },
      nota: { numero: 456 },
    });
    expect(resultado).toBe('NF 456 - Cliente Teste');
  });

  it('faz fallback de cliente.nome para cliente.razaoSocial quando nome for ausente', () => {
    const template = 'Prezado {{cliente.nome}}';
    const resultado = substituirTags(template, {
      cliente: { razaoSocial: 'EMPRESA RAZAO LTDA' },
    });
    expect(resultado).toBe('Prezado EMPRESA RAZAO LTDA');
  });

  it('preserva tags desconhecidas para não corromper texto', () => {
    const template = 'Tag {{desconhecida}} permanece';
    const resultado = substituirTags(template, {});
    expect(resultado).toBe('Tag {{desconhecida}} permanece');
  });

  it('retorna string vazia se o template for nulo ou vazio', () => {
    expect(substituirTags('', {})).toBe('');
    expect(substituirTags(null as unknown as string, {})).toBe('');
  });
});

describe('formatarTextoHtml', () => {
  it('escapa caracteres HTML perigosos e converte quebras de linha em <br />', () => {
    const texto = 'Aviso: <script>alert("xss")</script> & "aspas"\nSegunda linha\nTerceira linha';
    const resultado = formatarTextoHtml(texto);
    expect(resultado).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(resultado).toContain('&amp;');
    expect(resultado).toContain('&quot;aspas&quot;');
    expect(resultado).toContain('Segunda linha<br />Terceira linha');
  });

  it('retorna string vazia para entradas nulas ou vazias', () => {
    expect(formatarTextoHtml('')).toBe('');
    expect(formatarTextoHtml(null as unknown as string)).toBe('');
  });
});

