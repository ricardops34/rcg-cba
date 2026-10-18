# ADR 002 — Sessão Única por Usuário e Rotação Estrita de Refresh Tokens

- **Status:** Implementado 🟢
- **Data:** 2026-09-30 (Módulo `auth`)
- **Autores / Decisores:** Engenharia de Segurança & Produto

---

## 1. Contexto

A plataforma comercial lida com dados estratégicos de preços, comissões e carteiras de clientes. Usuários vendedores compartilhavam frequentemente credenciais de login ou deixavam sessões abertas simultaneamente em múltiplos dispositivos domésticos e computadores corporativos. 

Além disso, havia a necessidade de reforçar a segurança das renovações de JWT sem comprometer a usabilidade dos operadores que trabalham durante turnos com horários de expediente delimitados.

## 2. Decisão

1. **Sessão Única por Usuário (`acessos.abrirSessao`):**
   - Ao realizar um novo login com sucesso, o sistema encerra automaticamente todas as sessões anteriores do usuário com o motivo `MOTIVO_NOVO_ACESSO`.
   - Se o usuário tentar usar uma aba com sessão invalidada, o sistema emite `SessaoEncerradaException`, explicando com clareza na interface que um novo acesso foi iniciado em outro dispositivo.
   - Múltiplas abas abertas no mesmo navegador compartilham a mesma sessão (`sid`), evitando desconexões acidentais.
2. **Rotação Estrita de Refresh Token (One-Time Use):**
   - O refresh token em texto claro nunca é persistido; o banco armazena apenas seu hash SHA-256 (`hashToken`).
   - A cada chamada de `refresh`, o token recebido é revogado imediatamente e substituído por um novo par (novo access token + novo refresh token).
   - Se um token já revogado for reutilizado, isso indica potencial comprometimento e todas as sessões do usuário são revogadas preventivamente.
3. **Validação de Expediente no Refresh:**
   - A rota de refresh reavalia o expediente de trabalho do funcionário (`horarios.verificar`). Se o turno tiver encerrado, a renovação é negada e a sessão é encerrada (`MOTIVO_FORA_HORARIO`), impedindo que manter a aba aberta burle o fim do expediente.

## 3. Alternativas Consideradas

- **Sessões Múltiplas Livres (Padrão Web):** Permitir logins simultâneos em celular, tablet e desktop.
  - *Descarte:* Facilita o empréstimo indevido de contas entre colaboradores e dificulta a responsabilização em auditorias de alterações e acessos ao WhatsApp.
- **Refresh Token com Longa Duração sem Rotação:** O mesmo refresh token válido por 30 dias.
  - *Descarte:* Alto risco de roubo de token em estações compartilhadas ou redes inseguras.

## 4. Consequências

### Positivas
- **Responsabilidade Individual Estrita:** Toda ação no sistema (orçamentos, mensagens do WhatsApp, descontos) é atribuível sem ambiguidade a quem estava operando a conta.
- **Segurança Robusta de Sessão:** Rotação de chaves e bloqueio automático pós-expediente reduzem a superfície de ataque fora do horário comercial.

### Negativas / Trade-offs
- **Inconveniência para Usuários Multi-Dispositivo:** Um vendedor que loga no celular para consultar a Posição de Cliente na rua derruba a sessão que havia deixado aberta no computador do escritório, precisando relogar ao retornar.

