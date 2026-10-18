# produto-campos — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `produto-campos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `produto-campos`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `listar`**
  - Origem no legado: `apps/api/src/modules/produto-campos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `criar/atualizar/remover`**
  - Origem no legado: `apps/api/src/modules/produto-campos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `valoresDoProduto/valoresDoProdutoTx`**
  - Origem no legado: `apps/api/src/modules/produto-campos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `gravarValores`**
  - Origem no legado: `apps/api/src/modules/produto-campos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `normalizarValorDoCampo`**
  - Origem no legado: `apps/api/src/modules/produto-campos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`normalizar-valor.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/produto-campos/normalizar-valor.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

