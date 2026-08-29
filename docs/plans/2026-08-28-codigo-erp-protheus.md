# codigoErp no fluxo Protheus — plano de implementação

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Objetivo:** Unificar inclusão, atualização e exclusão dos registros do Protheus usando `codigoErp`, no mesmo ciclo determinado por `S_T_A_M_P_`.

**Arquitetura:** A API key identifica a empresa. Cada SQL filtra a filial corrente com `FWxFilial()`, mas monta `codigoErp` com a coluna `*_FILIAL` retornada. Cada mapeador lê `D_E_L_E_T_` e devolve `POST` para registro ativo ou `DELETE` para excluído. O estoque passa a possuir `codigoErp` próprio.

**Tecnologias:** AdvPL, FWExecStatement, FWRest, NestJS, Zod, Prisma e PostgreSQL.

---

## Mapa de contexto

### Arquivos a modificar

| Arquivo | Responsabilidade | Alteração |
|---|---|---|
| `Portal/BJ/BJIN110.prw` | Mapeadores cadastrais | Chaves com filial, leitura de `D_E_L_E_T_` e decisão do verbo |
| `Portal/BJ/BJIN120.prw` | Mapeadores transacionais | Mesma decisão para SF2, SD2, SE1, SCJ e SCK |
| `Portal/BJ/BJIN002.prw` | Motor | Consumir somente o verbo decidido pelo mapeador |
| `Portal/BJ/BJIN900.prw` | Ciclo | Retirar etapa independente de exclusões |
| `Portal/BJ/BJIN210.prw` | Orçamento para pedido | Vincular usando `C5_FILIAL-C5_NUM` em `codigoErp` |
| `packages/contracts/src/integracao.ts` | Contrato público | Incluir `codigoErp` no estoque |
| `apps/api/prisma/schema.prisma` | Persistência | Incluir chave de estoque e unicidade por empresa |
| `apps/api/src/modules/integracao/estoque/*` | Endpoint de estoque | Endereçar GET/PATCH/DELETE por `codigoErp` |
| `docs/integração/*` | Contrato vigente | Documentar chaves, verbos e estoque |
| `docs/planos/integracao-codigo-erp.md` | Plano vivo | Registrar decisões consolidadas |

### Riscos

- Alteração pública da rota de estoque.
- Migration necessária para `estoques.codigoErp`.
- Fontes PRW devem permanecer CP-1252.
- O workspace Protheus já contém alterações locais que devem ser preservadas.
- Itens aninhados não possuem controllers próprios na API atual; sua exclusão precisa atualizar o recurso pai, salvo ampliação explícita do contrato.

## Tarefas

1. Criar testes de contrato que exijam `codigoErp` no estoque e rotas por código.
2. Executar os testes e confirmar falha pelo contrato antigo.
3. Criar migration e alterar schema, contratos, service e controller de estoque.
4. Executar testes e TypeScript.
5. Criar verificações estáticas dos mapeadores AdvPL para as chaves e verbos definidos.
6. Executar verificações e confirmar falha antes da alteração.
7. Alterar os mapeadores e o ciclo, preservando código preexistente.
8. Converter/verificar exclusivamente os PRWs modificados em CP-1252.
9. Atualizar documentação.
10. Compilar os fontes no TDS e executar verificações finais.

