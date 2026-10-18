# agente — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `agente`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `agente`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `Grupo`**
  - Origem no legado: `apps/api/src/modules/agente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `Uso`**
  - Origem no legado: `apps/api/src/modules/agente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `Conversa`**
  - Origem no legado: `apps/api/src/modules/agente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `Configuração`**
  - Origem no legado: `apps/api/src/modules/agente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `Governança`**
  - Origem no legado: `apps/api/src/modules/agente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `Prompt`**
  - Origem no legado: `apps/api/src/modules/agente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`agente-tools.permissao.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/agente/agente-tools.permissao.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-02: Testes Automatizados (`anonimizar-agente.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/agente/anonimizar-agente.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-03: Testes Automatizados (`agente-meu-dia.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/agente/agente-meu-dia.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-04: Testes Automatizados (`agente-resumo-diario.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/agente/agente-resumo-diario.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-05: Testes Automatizados (`agente-resumo-metas.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/agente/agente-resumo-metas.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

