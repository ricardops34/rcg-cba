# estoque — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `estoque`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `estoque`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `findAll`**
  - Origem no legado: `apps/api/src/modules/estoque`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `findByProduto`**
  - Origem no legado: `apps/api/src/modules/estoque`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`estoque.service.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/estoque/estoque.service.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

