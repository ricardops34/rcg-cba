export type PortalClienteJwtPayload = {
  sub: string;
  empresaId: string;
  clienteId: string;
  contatoId: string;
  perfilId: string | null;
  nome: string;
  email: string;
  permissoes: string[];
  aud: 'portal-cliente';
};

export type PortalClienteUser = Omit<PortalClienteJwtPayload, 'sub' | 'aud'> & {
  credencialId: string;
};
