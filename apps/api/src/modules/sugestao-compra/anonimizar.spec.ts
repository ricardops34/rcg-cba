import {
  CAMPOS_PROIBIDOS,
  garantirPayloadAnonimo,
  montarPayloadAnonimo,
  type ClienteParaAnonimizar,
} from './anonimizar';

/**
 * Este teste existe porque a regra que ele protege é invisível no código de
 * chamada: quem monta o payload não vê que um campo a mais no `select` do
 * Prisma mandaria a razão social do cliente para um terceiro. O teste falha
 * antes disso chegar em produção.
 */

const clienteCompleto = (n: number): ClienteParaAnonimizar => ({
  id: `uuid-${n}`,
  // Prefixo distinto do código de produto de propósito: o teste abaixo verifica
  // que o código do cliente não trafega, e "00n" colidiria com "PROD-001".
  codigoErp: `CLI-${n}`,
  // Tudo abaixo é o que NÃO pode sair:
  razaoSocial: `RESTAURANTE SEGREDO ${n} LTDA`,
  nomeFantasia: `Segredo ${n}`,
  cnpjCpf: '12345678000199',
  municipio: 'Campo Grande',
  uf: 'MS',
  limiteCredito: 50000,
  cnaes: [{ codigo: '5611201' }, { codigo: null }],
  produtos: [
    { codigoErp: 'PROD-002', valorTotal: 9999.99 },
    { codigoErp: 'PROD-001', valorTotal: 1234.56 },
  ],
});

describe('montarPayloadAnonimo', () => {
  it('leva apenas códigos — nunca razão social, CNPJ ou valores', () => {
    const payload = montarPayloadAnonimo(clienteCompleto(0), [
      clienteCompleto(1),
      clienteCompleto(2),
    ]);
    const serializado = JSON.stringify(payload);

    for (const proibido of [
      'RESTAURANTE SEGREDO',
      'Segredo',
      '12345678000199',
      'Campo Grande',
      '50000',
      '9999.99',
      '1234.56',
      'uuid-0',
    ]) {
      expect(serializado).not.toContain(proibido);
    }

    for (const campo of CAMPOS_PROIBIDOS) {
      expect(serializado).not.toContain(`"${campo}"`);
    }
  });

  it('mantém os códigos que a IA precisa para achar padrão', () => {
    const payload = montarPayloadAnonimo(clienteCompleto(0), [
      clienteCompleto(1),
    ]);

    expect(payload.alvo.cnaes).toEqual(['5611201']);
    expect(payload.alvo.produtos).toEqual(['PROD-001', 'PROD-002']);
    expect(payload.comparaveis).toHaveLength(1);
  });

  it('rotula os clientes de forma opaca, sem UUID nem código do ERP', () => {
    const payload = montarPayloadAnonimo(clienteCompleto(0), [
      clienteCompleto(1),
      clienteCompleto(2),
    ]);

    expect(payload.alvo.ref).toBe('C0');
    expect(payload.comparaveis.map((c) => c.ref)).toEqual(['C1', 'C2']);
    // Nem o UUID interno nem o código do cliente no ERP atravessam.
    expect(JSON.stringify(payload)).not.toContain('CLI-');
    expect(JSON.stringify(payload)).not.toContain('uuid-');
  });

  it('descarta CNAE sem código na referência', () => {
    const payload = montarPayloadAnonimo(clienteCompleto(0), []);
    expect(payload.alvo.cnaes).not.toContain(null);
    expect(payload.alvo.cnaes).toHaveLength(1);
  });
});

describe('garantirPayloadAnonimo', () => {
  it('aceita um payload montado corretamente', () => {
    const payload = montarPayloadAnonimo(clienteCompleto(0), [
      clienteCompleto(1),
    ]);
    expect(() => garantirPayloadAnonimo(payload)).not.toThrow();
  });

  it('aborta se um campo proibido escapar para o corpo', () => {
    // Simula o erro real que isso previne: alguém acrescenta o cliente cru ao
    // payload achando que "só o nome não faz mal".
    const contaminado = {
      alvo: { ref: 'C0', cnaes: ['5611201'], produtos: ['PROD-001'] },
      comparaveis: [],
      extra: { razaoSocial: 'RESTAURANTE SEGREDO LTDA' },
    };
    expect(() => garantirPayloadAnonimo(contaminado)).toThrow(
      /campo proibido/i,
    );
  });

  it('detecta valor de negócio vazado junto do produto', () => {
    const contaminado = {
      alvo: {
        ref: 'C0',
        cnaes: [],
        produtos: [{ codigoErp: 'PROD-001', valorTotal: 9999 }],
      },
      comparaveis: [],
    };
    expect(() => garantirPayloadAnonimo(contaminado)).toThrow(/valorTotal/);
  });
});
