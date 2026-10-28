import { ipOuFaixaValido, ipPermitido, normalizarIp } from './ip-permitido';

describe('ip-permitido (SEC-12)', () => {
  it('normaliza o IPv4 dentro de IPv6 e os colchetes', () => {
    expect(normalizarIp('::ffff:200.150.10.20')).toBe('200.150.10.20');
    expect(normalizarIp('[::1]')).toBe('::1');
    expect(normalizarIp(' 10.0.0.1 ')).toBe('10.0.0.1');
  });

  it('valida IP, faixa e IPv6; recusa lixo', () => {
    for (const ok of ['200.150.10.20', '10.0.0.0/8', '0.0.0.0/0', '::1', '2001:db8::1']) {
      expect(ipOuFaixaValido(ok)).toBe(true);
    }
    for (const ruim of ['', 'abc', '300.1.1.1', '10.0.0.0/33', '10.0.0.0/8/2', '10.0.0', '2001:db8::/32', '10.0.0.1/x']) {
      expect(ipOuFaixaValido(ruim)).toBe(false);
    }
  });

  it('igualdade exata e faixa CIDR', () => {
    expect(ipPermitido('200.150.10.20', ['200.150.10.20'])).toBe(true);
    expect(ipPermitido('200.150.10.21', ['200.150.10.20'])).toBe(false);
    expect(ipPermitido('192.168.1.200', ['192.168.1.0/24'])).toBe(true);
    expect(ipPermitido('192.168.2.1', ['192.168.1.0/24'])).toBe(false);
    expect(ipPermitido('8.8.8.8', ['0.0.0.0/0'])).toBe(true);
    // /32 é o próprio endereço; /31 aceita dois.
    expect(ipPermitido('10.0.0.5', ['10.0.0.5/32'])).toBe(true);
    expect(ipPermitido('10.0.0.6', ['10.0.0.5/32'])).toBe(false);
    expect(ipPermitido('10.0.0.5', ['10.0.0.4/31'])).toBe(true);
  });

  it('IPv6 só por igualdade; sem IP não passa', () => {
    expect(ipPermitido('2001:db8::1', ['2001:db8::1'])).toBe(true);
    expect(ipPermitido('2001:db8::2', ['2001:db8::1'])).toBe(false);
    expect(ipPermitido('2001:db8::1', ['10.0.0.0/8'])).toBe(false);
    expect(ipPermitido(undefined, ['10.0.0.0/8'])).toBe(false);
    expect(ipPermitido('', ['0.0.0.0/0'])).toBe(false);
  });
});
