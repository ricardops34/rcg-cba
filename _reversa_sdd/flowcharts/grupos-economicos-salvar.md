# Fluxograma de função — `GruposEconomicosService.salvar`

```mermaid
flowchart TD
    Start[salvar id, input, user] --> F1{id ausente e não é admin de plataforma?}
    F1 -- sim --> X1[403 Grupo é criado pela administração da plataforma]
    F1 -- não --> F2[carrega grupo anterior se id existir]
    F2 --> F3[empresasAdministradas do ator]
    F3 --> F4{alguma empresa nova no input não é administrada pelo ator?}
    F4 -- sim --> X2[403 Para incluir, precisa ser administrador dela]
    F4 -- não --> F5[abre transação, timeout 20s]
    F5 --> F6[liberarModoSistema: bypass de RLS por grupo]
    F6 --> F7[FOR UPDATE no grupo, se existir]
    F7 --> F8{admin comum e há empresa nova?}
    F8 -- sim --> F9[garantirVagaDeEmpresa no plano do grupo]
    F9 --> F10
    F8 -- não --> F10[FOR UPDATE em todas as empresas envolvidas, ordem determinística]
    F10 --> F11[valida que todas as empresaIds existem]
    F11 --> F12[cria ou atualiza o grupo]
    F12 --> F13[para cada empresa a incluir]
    F13 --> F14{usuário vinculado ativo pertence a outro grupo que não é origem nem destino?}
    F14 -- sim --> X3[409 Conflict: revise os vínculos antes de agrupar]
    F14 -- não --> F15[planejarPerfisParaGrupo: resolve perfil equivalente no destino, ainda no grupo de origem]
    F15 --> F16[move usuários com vínculo ativo para grupoEconomicoId do destino]
    F16 --> F17[para cada empresa removida do grupo]
    F17 --> F18[cria grupo próprio com nome da empresa]
    F18 --> F19[marca empresa: situacao=suspensa, testeExpiraEm=null, novo grupo]
    F19 --> F20[aplicarPerfisNoGrupo no grupo próprio]
    F20 --> F21[move empresas incluídas para o grupo de destino]
    F21 --> F22[aplicarPerfisNoGrupo para cada empresa que trocou de grupo]
    F22 --> F23{grupo de origem ficou sem empresas?}
    F23 -- sim --> F24[soft delete do grupo de origem]
    F23 -- não --> End
    F24 --> End[retorna id, descricao do grupo]
```

**Pontos de atenção:**
- Toda a função roda em modo sistema (bypass de RLS por grupo) — necessário porque a
  operação atravessa múltiplos grupos simultaneamente.
- Locks `FOR UPDATE` seguem ordem determinística (por id) para evitar deadlock entre
  duas recomposições concorrentes que tocam os mesmos registros.
- Nenhuma empresa fica sem grupo ao final — removida do grupo atual sempre ganha um
  grupo próprio.
