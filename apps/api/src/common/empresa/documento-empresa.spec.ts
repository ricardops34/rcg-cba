import { validarDocumentoEmpresa } from './documento-empresa';

describe('Documento da empresa por tipo de pessoa', () => {
  it('aceita CPF para pessoa física', () => {
    expect(() => validarDocumentoEmpresa('fisica', '12345678901')).not.toThrow();
  });
  it('preserva CNPJ como padrão para cadastros antigos', () => {
    expect(() => validarDocumentoEmpresa(undefined, '11222333000181')).not.toThrow();
  });
  it.each([
    ['fisica', '11222333000181'],
    ['juridica', '12345678901'],
    ['fisica', '1234567890x'],
  ])('recusa documento incompatível com %s', (tipo, documento) => {
    expect(() => validarDocumentoEmpresa(tipo, documento)).toThrow();
  });
});
