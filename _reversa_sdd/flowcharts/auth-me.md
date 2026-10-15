# Fluxograma de função — `AuthService.me`

```mermaid
flowchart TD
    Start[me usuarioId, empresaAtivaId] --> F1[busca usuario]
    F1 --> F2[withUsuario: busca vinculos ativos usuarioEmpresa + empresa + rotinaInicial]
    F2 --> F3[withUsuario: busca perfil + rotinaInicial do perfil]
    F3 --> F4{existe vínculo ativo com empresaAtivaId?}
    F4 -- não --> F5[daEmpresa = conjuntos vazios; permissoes = vazio]
    F4 -- sim --> F6[desativadosDaEmpresa]
    F6 --> F7[busca todas perfilPermissao do perfil]
    F7 --> F8[filtra: sistemaBase OU não é módulo administração; aplica rotinaNoAr]
    F8 --> F9[mapeia para codigoRotina.acao]
    F5 --> F10
    F9 --> F10[computeMustChangePassword]
    F10 --> F11{ativo existe e rotinaInicial pessoal setada?}
    F11 -- sim --> F12{permissoes inclui codigo.visualizar da escolha pessoal?}
    F12 -- sim --> F13[rotaEscolhida = rota da escolha pessoal]
    F12 -- não --> F14[rotaEscolhida = null]
    F11 -- não --> F14
    F13 --> F15
    F14 --> F15{ativo existe?}
    F15 -- não --> F16[rotinaInicialRota = null]
    F15 -- sim --> F17[rotinaInicialRota = rotaEscolhida OU rota padrão do perfil]
    F16 --> End[monta objeto de retorno completo]
    F17 --> End
```

**Pontos de atenção:**
- Permissões são recalculadas a cada chamada — não reaproveita o conteúdo do JWT,
  então refletem mudanças de perfil/módulo desligado sem exigir novo login.
- A rota inicial pessoal só é honrada se a permissão `.visualizar` correspondente
  ainda existir no momento da chamada; perdê-la temporariamente não apaga a escolha.
