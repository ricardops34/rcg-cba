# Fluxograma de função — `ClientesReceitaLoteService.aplicarReceita`

```mermaid
flowchart TD
    Start[aplicarReceita empresaId, user, clienteId, consulta] --> F1[busca cliente + vínculos CNAE atuais]
    F1 --> F2[para cada campo em CAMPOS_RECEITA]
    F2 --> F3{valor da Receita vazio?}
    F3 -- sim --> F4[ignora campo]
    F3 -- não --> F5{campo atual do cliente vazio?}
    F5 -- sim --> F6{campo travado na config da empresa?}
    F6 -- sim --> F7[propor.campo = valor]
    F6 -- não --> F8[preencher.campo = valor]
    F5 -- não --> F9{valor normalizado difere do atual?}
    F9 -- sim --> F7
    F9 -- não --> F4
    F2 --> F10[resolve CNAEs sugeridos com referência local]
    F10 --> F11{cliente sem CNAE algum?}
    F11 -- sim --> F12{CNAEs travados?}
    F12 -- não --> F13[preencher.cnaes = todos sugeridos; preencher.cnaePrincipal se houver]
    F12 -- sim --> F14[propor.cnaes]
    F11 -- não --> F15[propor.cnaes = união atual + sugeridos nunca remove]
    F13 --> F16
    F14 --> F16
    F15 --> F16[alteracoes.registrar com input=preencher, aplicarDireto=true]
    F16 --> F17[alteracoes.registrar com input=propor, aplicarDireto=false]
    F17 --> End[retorna atualizou, pendente, camposAtualizados, camposPendentes, cnaesAplicados]
```

**Pontos de atenção:**
- Mesma função serve a consulta de 1 cliente e o lote — a regra por campo nunca diverge
  entre os dois caminhos.
- CNAE da Receita sem referência local (sync do IBGE atrasado) nunca entra como
  preenchimento ou proposta — vira apenas aviso informativo no retorno.
