# Fluxograma de função — `OrcamentosService.create`

```mermaid
flowchart TD
    Start["create(empresaId, user, input, opcoes?)"] --> F1{opcoes.ignorarEscopo?}
    F1 -- sim --> F2["escopo = null"]
    F1 -- não --> F3[resolverEscopoVendedores]
    F2 --> F4[garantirClienteNoEscopo input.clienteId]
    F3 --> F4
    F4 --> F5{cliente encontrado e no escopo?}
    F5 -- não --> X1["404 Cliente não encontrado / fora do seu escopo"]
    F5 -- sim --> F6["vendedorId = cliente.vendedorId ?? input.vendedorId"]
    F6 --> F7[garantirVendedorNoEscopo vendedorId]
    F7 --> F8{vendedor fora do escopo?}
    F8 -- sim --> X2["404 Vendedor fora do seu escopo"]
    F8 -- não --> F9{input.oportunidadeId informado?}
    F9 -- sim --> F10[garantirOportunidadeNoEscopo]
    F9 -- não --> F11
    F10 --> F11{oportunidade encontrada e no escopo?}
    F11 -- não (se informado) --> X3["404 Oportunidade não encontrada / fora do seu escopo"]
    F11 -- sim/ausente --> F12[origemDaVenda: vendedor/administrador/superior conforme regra]

    F12 --> F13["dataValidade = ajustarValidadeOrcamento(dataValidade)"]
    F13 --> F14["calcularItensOrcamento (ver code-analysis §3.1) — pode lançar 400 se DESCONTO_ACIMA_LIMITE_BLOQUEIA"]
    F14 --> F15{lançou BadRequestException?}
    F15 -- sim --> X4["400 desconto excede o máximo da regra"]
    F15 -- não --> F16["tx.orcamento.create: header + numero (proximoNumeroOrcamento) + itens"]

    F16 --> F17{status === 'aprovado'?}
    F17 -- sim --> F18[orcamentoExigeAutorizacao]
    F17 -- não --> F20
    F18 --> F19{exige autorização?}
    F19 -- sim --> X5["409 solicite autorização antes de efetivar (desfaz a transação)"]
    F19 -- não --> F20{header.dataRetorno informado?}
    F20 -- sim --> F21[criarAtividadeRetorno]
    F20 -- não --> F22
    F21 --> F22["registrarAtividadeOrcamento: criacao"]
    F22 --> R1["retorna ocultarComissaoDosItens(orcamento)"]
```

**Pontos de atenção:**
- `F6`: o `vendedorId` do payload é **descartado** sempre que o cliente já tem vendedor
  cadastrado — o campo só serve de fallback para cliente sem vendedor vinculado. Isto
  significa que o formulário pode mostrar um vendedor e o orçamento gravar outro, se o
  cadastro do cliente mudou entre a abertura do form e o salvar.
- `F12` (`origemDaVenda`) roda **depois** de todas as validações de escopo — ele não pode
  falhar por escopo, só classifica quem está executando.
- `F17`–`F19`: criar já `aprovado` passa pela mesma trava de autorização de desconto que
  a efetivação por `update` — não existe um caminho de criação que pule a checagem.
- Toda a função roda dentro de uma única transação (`withTenant`); a exceção em `F19`
  desfaz a criação do orçamento inteira, incluindo os itens já persistidos em `F16`.
- `F22` sempre executa no caminho feliz, mesmo quando `F20`/`F21` não disparam — todo
  orçamento criado gera pelo menos o evento `criacao` no histórico.
