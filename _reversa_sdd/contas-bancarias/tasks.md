# contas-bancarias — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `contas-bancarias`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `contas-bancarias`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `findAll — GET /contas-bancarias`**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `findOne — GET /:id`**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `create — POST`**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `update — PATCH /:id`**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `setLogo — POST /:id/logo (multipart file)`**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `removeLogo — DELETE /:id/logo`**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `remove — DELETE /:id`**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `contaPadrao(empresaId) (exportada)`**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Teste Unitário do Fluxo Principal**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Validar execução com dados válidos e retorno esperado.
  - Confiança: 🟢

- [ ] **TT-02: Teste de Validação e Isolamento Multi-tenant**
  - Origem no legado: `apps/api/src/modules/contas-bancarias`
  - Critério de pronto: Garantir que consultas não retornam dados de outros tenants.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

