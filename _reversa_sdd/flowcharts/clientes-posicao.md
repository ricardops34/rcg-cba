# Fluxograma de função — `ClientesService.posicao`

```mermaid
flowchart TD
    Start[posicao empresaId, user, clienteId] --> F1[busca cliente no escopo de carteira]
    F1 --> F2{encontrado?}
    F2 -- não --> X1[404 Cliente não encontrado]
    F2 -- sim --> F3{usuário pode ver WhatsApp?}
    F3 -- sim --> F4[busca conversas WhatsApp da instância do usuário]
    F3 -- não --> F5
    F4 --> F5[busca em paralelo: notas de venda, comodatos, devoluções tipo D, títulos, mix]
    F5 --> F6[equipamentosEmComodato: saldo por produto via SQL]
    F6 --> F7[verifica se há conta bancária padrão]
    F7 --> F8[calendário útil da empresa: resolve vencimento efetivo]
    F8 --> F9[calcula status de cada título: aberto/vencido/baixado]
    F9 --> F10[monta resumo: totalNotas, totalComprado, totalTitulosAberto/Vencido, totalDevolucoes/Devolvido]
    F10 --> End[retorna cliente, whatsapp, resumo, notas, comodatos, devolucoes, titulos, mix, equipamentos]
```

**Pontos de atenção:**
- Escopo de carteira é verificado **uma única vez**, no cliente; notas/títulos não
  reaplicam o filtro de vendedor (o `vendedorId` de cada nota é "quem executou", não o
  titular da carteira, e não deve restringir a visibilidade de um cliente já autorizado).
- Devolução não abate `totalComprado` — quem abate é o campo `vlrDev` da nota de venda
  original.
