# cliente-campo-config — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `cliente-campo-config`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `cliente-campo-config`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `obterConfig`**
  - Origem no legado: `apps/api/src/modules/cliente-campo-config`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `atualizar`**
  - Origem no legado: `apps/api/src/modules/cliente-campo-config`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Teste Unitário do Fluxo Principal**
  - Origem no legado: `apps/api/src/modules/cliente-campo-config`
  - Critério de pronto: Validar execução com dados válidos e retorno esperado.
  - Confiança: 🟢

- [ ] **TT-02: Teste de Validação e Isolamento Multi-tenant**
  - Origem no legado: `apps/api/src/modules/cliente-campo-config`
  - Critério de pronto: Garantir que consultas não retornam dados de outros tenants.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

