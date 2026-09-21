import { z } from "zod";

/**
 * Base de demonstração: popular a empresa com dado fictício, e limpar.
 *
 * As duas operações moram na mesma tela porque são o mesmo assunto —
 * preparar o ambiente antes de mostrar o sistema —, mas têm ações de RBAC
 * diferentes (`demo-dados.cadastrar` e `demo-dados.excluir`): gerar é
 * repetível, limpar não tem volta.
 */

/** O que a geração produziu. */
export const demoResumoSchema = z.object({
  empresa: z.string(),
  /** Os meses povoados, em MM/AAAA. */
  periodo: z.array(z.string()),
  usuarios: z.number().int(),
  /** O administrador ganhou cadastro de vendedor, para as telas de carteira. */
  adminVirouVendedor: z.boolean(),
  clientes: z.number().int(),
  produtos: z.number().int(),
  notas: z.number().int(),
  titulos: z.number().int(),
  titulosComBoleto: z.number().int(),
  orcamentos: z.number().int(),
  conversas: z.number().int(),
  atividades: z.number().int(),
  /** A mesma para todos os usuários criados — é demonstração. */
  senha: z.string(),
  acessos: z.array(z.object({ email: z.string(), perfil: z.string() })),
});
export type DemoResumo = z.infer<typeof demoResumoSchema>;

/** O que a limpeza apagou, por tabela. Só as que tinham linha. */
export const demoLimpezaSchema = z.object({
  apagados: z.array(
    z.object({ tabela: z.string(), linhas: z.number().int() }),
  ),
  total: z.number().int(),
});
export type DemoLimpeza = z.infer<typeof demoLimpezaSchema>;
