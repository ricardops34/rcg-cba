# orcamentos — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `orcamentos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `orcamentos`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `precoProduto(empresaId, user, clienteId, produtoId)`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `findAll(empresaId, user, query, opcoes?)`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `findOne(empresaId, user, id, opcoes?)`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `update(empresaId, user, id, input)`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `remove(empresaId, user, id)`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `solicitarAutorizacaoDesconto/autorizarDesconto`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `gerarPdf(empresaId, quem, id, opcoes?)`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `calcularItensOrcamento (arquivo próprio, compartilhado)`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `registrarAtividadeOrcamento/orcamentoExigeAutorizacao (arquivo próprio)`**
  - Origem no legado: `apps/api/src/modules/orcamentos`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`validade-orcamento.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/orcamentos/validade-orcamento.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-02: Testes Automatizados (`pode-excluir-orcamento.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/orcamentos/pode-excluir-orcamento.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

