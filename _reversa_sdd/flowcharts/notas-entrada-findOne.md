# Fluxograma de função — `NotasEntradaService.findOne`

```mermaid
flowchart TD
    Start[findOne empresaId, user, id] --> F1{"user.isAdmin OU user.permissoes inclui notas-entrada.visualizar?"}
    F1 -- sim --> F2["veCompras = true"]
    F1 -- não --> F3["veCompras = false"]
    F2 --> F4["escopo = null (sem restrição)"]
    F3 --> F5[resolverEscopoVendedores tx, empresaId, user]
    F5 --> F6["escopo = lista de vendedorId, ou null = carteira inteira"]
    F4 --> F7[monta where final]
    F6 --> F7
    F7 --> F8{veCompras?}
    F8 -- sim --> F9["where = {id, empresaId, deletedAt:null}"]
    F8 -- não --> F10{escopo é lista?}
    F10 -- sim --> F11["where += {tipo:'D', cliente:{vendedorId:{in:escopo}}}"]
    F10 -- não (null) --> F12["where += {tipo:'D', cliente:{isNot:null}}"]
    F9 --> F13[tx.notaEntrada.findFirst where, include fornecedor/cliente/condicaoPagamento/itens]
    F11 --> F13
    F12 --> F13
    F13 --> F14{nota encontrada?}
    F14 -- não --> X1[throw NotFoundException]
    F14 -- sim --> R1[retorna nota]
```

**Pontos de atenção:**
- A permissão (`RequirePermission` no controller) só decide **se a requisição entra**;
  quem reforça **o que ela pode ver** é este `where` montado no service — sem ele,
  `posicao-cliente.visualizar` sozinho abriria qualquer nota de compra (tipo `'N'`) por
  id, incluindo custo.
- `escopo === null` não significa "sem acesso": significa carteira inteira (vendedor sem
  restrição de hierarquia) — tratado como `cliente.isNot: null`, não como ausência de
  filtro de tipo. `tipo: 'D'` nunca é relaxado por esse ramo.
- Mesmo padrão de dupla porta de acesso existe em `clientes.posicao` (devoluções da
  aba) — este `findOne` é o lado inverso: acessado pelo id da nota, não pelo id do
  cliente.
