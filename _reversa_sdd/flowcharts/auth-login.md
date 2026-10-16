# Fluxograma de função — `AuthService.login`

```mermaid
flowchart TD
    Start[login recebe email, senha, empresaAlias?] --> F1{Usuário existe e ativo?}
    F1 -- não --> E1[registra login_falha] --> X1[401 Credenciais inválidas]
    F1 -- sim --> F2{bloqueadoAte no futuro?}
    F2 -- sim --> E2[registra login_bloqueado] --> X2[423 Conta bloqueada]
    F2 -- não --> F3{bcrypt.compare senha OK?}
    F3 -- não --> F3a[tentativasFalhas++]
    F3a --> F3b{tentativas >= limite da política?}
    F3b -- sim --> F3c[zera contador, seta bloqueadoAte] --> E3[registra login_bloqueado] --> X3[401 Credenciais inválidas]
    F3b -- não --> F3d[salva tentativasFalhas] --> E4[registra login_falha] --> X3
    F3 -- sim --> F4{empresaAlias informado?}
    F4 -- sim --> F4a[busca empresa pelo alias, sem filtrar situação]
    F4a --> F4b{empresa existe?}
    F4b -- não --> X4[403 Você não tem acesso a esta empresa]
    F4b -- sim --> F4c{motivoBloqueio da empresa?}
    F4c -- sim --> E5[registra login_falha] --> X5[403 com o motivo]
    F4c -- não --> F5
    F4 -- não --> F5[findVinculoAtivo do usuário]
    F5 --> F6{vínculo encontrado?}
    F6 -- não --> E6[registra login_falha] --> X6["403 (com alias) ou 401 (sem alias)"]
    F6 -- sim --> F7[horarios.verificar usuarioId, empresaId]
    F7 --> F8{dentro do expediente?}
    F8 -- não --> E7[registra login_fora_horario] --> X7[ForaDoExpedienteException]
    F8 -- sim --> F9[acessos.abrirSessao]
    F9 --> F10[acessos.encerrarSessoes: derruba outras sessões do usuário]
    F10 --> F11{havia sessões derrubadas?}
    F11 -- sim --> E8[registra sessao_substituida]
    F11 -- não --> F12
    E8 --> F12[buildAccessToken]
    F12 --> F13[issueRefreshToken]
    F13 --> F14[computeMustChangePassword]
    F14 --> F15[zera tentativasFalhas, atualiza ultimoLogin]
    F15 --> F16[registra login_sucesso]
    F16 --> End[retorna accessToken, refreshToken, expiresIn=900, mustChangePassword]
```

**Pontos de atenção:**
- A resposta de credenciais inválidas é a mesma para e-mail inexistente e usuário
  inativo — não revela qual condição falhou.
- Expediente é checado **depois** da senha e **depois** de resolver a empresa, por
  design (não dar pista a quem erra a senha; feriado é por empresa).
