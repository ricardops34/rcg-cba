/** Campos compatíveis com Usuario. Telefone não implica celular/WhatsApp. */
export const DADOS_VENDEDOR_SELECT = {
  codigoErp: true,
  nomeReduzido: true,
  telefone: true,
  dataNascimento: true,
} as const;

export type DadosVendedor = {
  codigoErp: string | null;
  nomeReduzido: string | null;
  telefone: string | null;
  dataNascimento: Date | null;
};

/** Dados da conta são únicos no grupo: não escolhe arbitrariamente uma empresa. */
export function dadosDoVendedor(vendedores: DadosVendedor[]) {
  const texto = (campo: 'codigoErp' | 'nomeReduzido' | 'telefone') => {
    const valores = [
      ...new Set(
        vendedores.map((v) => v[campo]?.trim()).filter((v): v is string => !!v),
      ),
    ];
    return valores.length === 1 ? valores[0] : null;
  };
  const datas = [
    ...new Set(
      vendedores.flatMap((v) =>
        v.dataNascimento ? [v.dataNascimento.toISOString().slice(0, 10)] : [],
      ),
    ),
  ];
  return {
    codigoErp: texto('codigoErp'),
    nomeReduzido: texto('nomeReduzido'),
    telefone: texto('telefone'),
    dataNascimento:
      datas.length === 1 ? new Date(`${datas[0]}T00:00:00.000Z`) : null,
  };
}
