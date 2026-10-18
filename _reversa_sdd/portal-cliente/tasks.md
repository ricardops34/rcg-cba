# portal-cliente — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `portal-cliente`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `portal-cliente`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `Rota`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `POST /portal-cliente/auth/login`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `POST /portal-cliente/auth/refresh`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `POST /portal-cliente/auth/logout`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `GET /portal-cliente/me`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `GET /portal-cliente/orcamentos`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `PATCH /portal-cliente/orcamentos/:id/aprovar {observacao?}`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `PATCH /portal-cliente/orcamentos/:id/recusar {observacao?}`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `GET/PUT /portal-cliente-admin/config`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-10: Implementar `POST /portal-cliente-admin/acessos`**
  - Origem no legado: `apps/api/src/modules/portal-cliente`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`portal-cliente.service.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/portal-cliente/portal-cliente.service.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

