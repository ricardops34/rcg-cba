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

## Portal do cliente (escavação de 2026-10-16)

Achados do módulo `portal-cliente` (`_reversa_sdd/code-analysis.md`, seção 4.x do módulo). Também
**anotados, sem correção e sem reprodução**.

### Decisões pendentes do usuário

- **P.1 — cliente pode efetivar orçamento com desconto acima do máximo?** Hoje a aprovação pelo portal
  pula `orcamentoExigeAutorizacao` e o orçamento vai à fila do ERP. Se a resposta for "não", o portal
  deve devolver o 409 da aprovação interna (ou deixar o orçamento em "aguardando autorização").
- **P.2 — escopo do portal:** as rotinas `notas`, `compras`, `titulos`, `catalogo`, `carrinho`,
  `cadastro`, `contatos` e as opções da configuração são para fazer ou para tirar do catálogo? E o
  desconto deve aparecer para o cliente (`exibirDesconto`)?
- **P.3 — o que `observacao` guarda** na tela de orçamentos (texto da proposta ou nota interna).
- **P.4 — administração do portal:** criar a tela (config, acessos, desativar, redefinir senha) e a
  troca/recuperação de senha do contato.

### Etapas

- [ ] 16. **P.1** trava de desconto na decisão do cliente (depende da decisão acima)
- [ ] 17. **4.2** validade vencida: gravar `expirado` **fora** da transação que lança (ou sem lançar),
      e conferir o dia da validade
- [ ] 18. **4.3** decisão com condição de status no `UPDATE` (`updateMany`)
- [ ] 19. **4.4** decisão do cliente gera `aprovacao_cliente`/`recusa_cliente` e notifica o vendedor
- [ ] 20. **4.5** conferir contato/cliente/habilitação/config/situação da empresa na decisão (ou token
      mais curto) e a situação da empresa no login e no refresh
- [ ] 21. **4.6** login: mesma resposta para conta bloqueada, `bcrypt` com hash falso quando não há
      credencial, zerar o contador ao vencer o bloqueio, incremento atômico
- [ ] 22. **4.8** `criarAcesso`: não sobrescrever `principal`/`ativo` do contato; avisar quando a
      config está inativa; login pelo alias atual (não o copiado)
- [ ] 23. **4.7/P.4** tela de administração, desativar/redefinir acesso, troca de senha
- [ ] 24. **4.9/P.2** ler (ou remover) as opções da configuração; respeitar `exibirDesconto`
- [ ] 25. **4.10** refresh atômico e detecção de reuso, limpeza de log/sessões, testes do módulo
