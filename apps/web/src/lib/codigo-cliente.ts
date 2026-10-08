/**
 * Código do cliente no ERP como o vendedor o lê: `00434801` → `004348/01`
 * (código de 6 dígitos + loja de 2). É o formato de 99,9% da base; o que não
 * segue o padrão (clientes de demonstração, por exemplo) volta como está.
 */
export function codigoClienteErp(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return /^\d{8}$/.test(codigo) ? `${codigo.slice(0, 6)}/${codigo.slice(6)}` : codigo;
}
