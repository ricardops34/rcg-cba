# Correções dos achados do Reversa — integração (2026-10-16)

Origem: a escavação do Reversa nos módulos `integracao` e `integracao-keys`
(`_reversa_sdd/code-analysis.md`, seções 4.x). Decisão do usuário em 2026-10-16:
**anotar agora e corrigir depois, em lote**, no mesmo formato do lote de 15/10
([2026-10-15-correcoes-achados-reversa.md](2026-10-15-correcoes-achados-reversa.md)).
Nada foi corrigido ainda, e **nenhum achado foi reproduzido** — vieram da leitura do código.

## Antes de corrigir: reproduzir em dev

- **4.1** — desativar `titulos-receber` no monitor e subir uma carga com a chave de API.
  Se subir, o achado está confirmado (mesma falha de RLS sem contexto que o guard já corrigiu).
- **4.2** — mandar um `payload` inválido (campo faltando, tipo errado) em `arquivo/importar`.
- Perguntar ao usuário se o ERP em produção já usa `arquivo/importar` e `arquivo/exportar`.
  Se usa, o 4.3 vira urgente.

## Decisões pendentes do usuário

- **4.4 — cliente por `PUT`/carga:** gravar direto (o cadastro nasce no ERP) ou passar pela fila
  de aprovação como o `PATCH`? Hoje só o `PATCH` respeita a decisão de 2026-08-14.
- **4.2/4.3 — TXT legado:** manter, corrigir ou aposentar `arquivo/importar` e `arquivo/exportar`?
- **4.5 — conta bancária inexistente no título:** voltar ao 404 do comentário ou manter a criação
  automática (e então corrigir o comentário)?

## Etapas, na ordem recomendada

Primeiro as falhas de controle, depois as que gravam dado errado em silêncio, por último as que
dependem de decisão ou são menores.

- [ ] 1. **4.1** `conferirEndpointsAtivos` dentro de `withTenant` (recebimento e a cada bloco)
- [ ] 2. **4.2** `arquivo/importar`: schema Zod por item, `conferirEndpointsAtivos`, linha inválida em
      `erros`, `case` de `orcamentos`/`pedidos` ou recusa explícita
- [ ] 3. **4.3** `arquivo/exportar`: exportar a fila `cliente_envios_erp` (ou retirar o endpoint)
- [ ] 4. **K.1** carga em andamento não confere se a chave foi revogada/expirou/excluída
- [ ] 5. **K.2** `PATCH endpoints/:endpointKey` com DTO Zod (`ativo` obrigatório e booleano)
- [ ] 6. **4.5** `resolverContaBancaria`: 404 em vez de criar conta
- [ ] 7. **4.6** `resolverProduto`: sem busca por substring em `estoque` e `tabelas-preco`
- [ ] 8. **4.7** `upsert` de orçamento: recusar `aprovado` e `origem=erp` (e conferir no `remove`)
- [ ] 9. **4.4** cliente por `PUT`/carga (depende da decisão acima)
- [ ] 10. **4.8** itens de nota: recalcular `clienteId`/`vendedorId`/`dtEmissao`/`ano`/`mes` quando só o
      cabeçalho muda
- [ ] 11. **4.9** `estoque`: achar a linha por um critério só (e tratar a colisão de `chave`)
- [ ] 12. **4.10** demais: contagem de `pedidos` no lote, comentário de `tabelas-preco`,
      `vendedorChave = "01-"` em cliente, paginação das filas, trava do `vincular`
- [ ] 13. **K.3** auditoria de quem ligou/desligou um endpoint (`updatedBy`) e de `expiraEm` no passado
- [ ] 14. Testes: `ApiKeyGuard`, `arquivo/importar|exportar`, filas de envio, `pedidos`, `estoque`
- [ ] 15. `tsc` e suíte da API; validar em dev (recriar o container da API, conforme o runbook)

## Observações

- As duas decisões de comportamento que mexem no contrato com o ERP (4.4 e 4.5) precisam de
  aviso a quem mantém o Protheus (fontes `BJPLA002`–`BJPLA005`) antes do deploy.
- Registrar no runbook qualquer comando novo que a validação exigir.
