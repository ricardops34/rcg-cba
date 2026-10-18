# ADR 007 — Mecanismo de Suporte Autorizado com Consentimento do Cliente ("Entrar como Suporte")

- **Status:** Implementado 🟢
- **Data:** 2026-09-28 (Commit `f4107ae`, Módulo `suporte-acesso`)
- **Autores / Decisores:** Equipe de Segurança & Operações SaaS

---

## 1. Contexto

Em plataformas SaaS B2B multi-tenant, operadores de suporte técnico e desenvolvedores frequentemente precisam acessar o ambiente da empresa cliente para diagnosticar bugs, conferir cálculos de impostos ou ajudar na configuração de instâncias do WhatsApp.

A prática comum de conceder uma senha mestra ou permitir que administradores da plataforma acessem os dados de qualquer tenant sem consentimento viola normas de privacidade (LGPD), quebra o princípio do menor privilégio e expõe o provedor do software a graves responsabilidades jurídicas em caso de vazamento.

## 2. Decisão

Implementar um protocolo formal de **Autorização Temporária de Suporte Técnico**:

1. **Consentimento Explícito do Cliente (`empresa_suporte_acessos`):**
   - O administrador da empresa ativa deve acessar o sistema e emitir uma liberação expressa de suporte, definindo:
     - Prazo de validade estrito (ex.: 2 horas, 1 dia, máximo 7 dias).
     - Motivo ou número do chamado de suporte.
   - O cliente pode revogar a autorização a qualquer momento com efeito imediato.
2. **Sessão Especial de Suporte (`empresa_suporte_logs`):**
   - Ao "Entrar como suporte", o analista recebe um token de escopo restrito registrado na tabela de auditoria com IP, data/hora e justificativa.
   - Cada tela, relatório ou ação executada pelo suporte grava rastro indelével na auditoria da empresa.
3. **Bloqueio Automático:**
   - Expirada a autorização, qualquer tentativa de requisição ou refresh token do operador de suporte é bloqueada com HTTP 403.

## 3. Alternativas Consideradas

- **Acesso Irrestrito para Role `superadmin` / `admin_plataforma`:**
  - *Descarte:* Risco de compliance gravíssimo; nenhum cliente corporativo de grande porte aceita que técnicos acessem suas carteiras e faturamentos sem autorização prévia.
- **Compartilhamento de Senha de Usuário por Chamado:**
  - *Descarte:* Violação frontal da segurança; impede saber se uma ação foi feita pelo cliente ou pelo suporte técnico.

## 4. Consequências

### Positivas
- **Conformidade Total com LGPD e ISO 27001:** O cliente é o soberano de seus dados e autoriza o acesso temporário com registro auditável.
- **Transparência e Confiança:** O cliente tem acesso a um relatório claro que mostra exatamente quando o suporte entrou e o que acessou.

### Negativas / Trade-offs
- **Fricção Inicial em Incidentes Críticos:** Se um cliente estiver com problemas e nenhum administrador local estiver disponível para liberar o acesso, o suporte não pode intervir na tela até que a liberação seja efetuada.

