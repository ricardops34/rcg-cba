# Fluxograma de função — `AuthService.refresh`

```mermaid
flowchart TD
    Start[refresh recebe refreshToken] --> H1[hashToken SHA-256]
    H1 --> F1[busca RefreshToken por tokenHash]
    F1 --> F2{tem sessaoId vinculado?}
    F2 -- sim --> F3[consulta situacaoSessao]
    F3 --> F4{sessão encerrada por novo_acesso ou desconectado?}
    F4 -- sim --> X1[SessaoEncerradaException com motivo]
    F4 -- não --> F5
    F2 -- não --> F5{token inexistente, revogado ou expirado?}
    F5 -- sim --> X2[401 Refresh token inválido ou expirado]
    F5 -- não --> F6[revoga o token usado: revokedAt = agora]
    F6 --> F7[horarios.verificar usuarioId, empresaId]
    F7 --> F8{dentro do expediente?}
    F8 -- não --> F8a[encerrarAcessoPorHorario: revoga todos refresh tokens abertos + encerra sessões]
    F8a --> X3[ForaDoExpedienteException]
    F8 -- sim --> F9[findVinculoAtivo: mesma empresa da sessão, senão primeira disponível]
    F9 --> F10{vínculo encontrado?}
    F10 -- não --> X4[401 Usuário sem empresa ativa vinculada]
    F10 -- sim --> F11[buildAccessToken]
    F11 --> F12[issueRefreshToken: novo token]
    F12 --> F13{havia sessaoId?}
    F13 -- sim --> F14[acessos.tocarSessao: avança ultimaAtividadeEm]
    F13 -- não --> End
    F14 --> End[retorna novo accessToken, refreshToken, expiresIn=900]
```

**Pontos de atenção:**
- O token recebido é **sempre** revogado antes de qualquer outra checagem de
  continuidade (expediente) — rotação estrita, nunca reutilizável.
- Esta rota não passa pelo `JwtAuthGuard` (é autenticada pelo próprio refresh token),
  por isso a checagem de expediente é duplicada aqui — sem ela, uma aba deixada aberta
  renovaria o acesso indefinidamente após o fim do expediente.
