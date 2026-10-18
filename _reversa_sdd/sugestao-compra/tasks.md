# sugestao-compra — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `sugestao-compra`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `sugestao-compra`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `listagem(empresaId, user, query)`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `calculadaDoCliente(empresaId, user, clienteId)`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `gerarLinhasParaCliente(...) *(privado)*`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `gerarLote(empresaId, user, body)`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `iniciarLote/executarLote`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `gerarParaCliente(empresaId, user, clienteId, meses?)`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `excluirCalculo(empresaId, user, filtro)`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `ultimaExecucao(empresaId)`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `clientesDoMesmoRamo/motivoInelegivel/clientesElegiveis *(privados)*`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-10: Implementar `buscarSemelhantes/produtosDosSemelhantes/cestaDoCliente/precosNaTabelaDoCliente *(privados)*`**
  - Origem no legado: `apps/api/src/modules/sugestao-compra`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`anonimizar.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/sugestao-compra/anonimizar.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

