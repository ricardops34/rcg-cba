# usuarios — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `usuarios`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas e migrations aplicadas com RLS para o módulo `usuarios`.
- [ ] Dependências de injeção (`PrismaService`, módulos auxiliares) configuradas no container NestJS.
- [ ] Schemas Zod de entrada e saída definidos em `@plataforma/contracts`.

## Tarefas

- [ ] **T-01: Implementar `findAll(empresaId, query)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-02: Implementar `findOne(id, empresaAtivaId?)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-03: Implementar `create(input, empresaId, actorId, atorEhAdminPlataforma)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-04: Implementar `update(id, input, actorId)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-05: Implementar `resetSenha(id, input, actorId)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-06: Implementar `remove(id, actorId)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-07: Implementar `vincularEmpresa(usuarioId, empresaId, input, actorId, atorEhAdminPlataforma)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-08: Implementar `obterHorarios / salvarHorarios(id, input, actorId)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-09: Implementar `desvincularEmpresa(usuarioId, empresaId, actorId, empresaAtivaId)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-10: Implementar `empresasNoAlcance(empresaAtivaId) (privado)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

- [ ] **T-11: Implementar `garantirPodeAtribuirPerfil(...) (privado)`**
  - Origem no legado: `apps/api/src/modules/usuarios`
  - Critério de pronto: Função implementada com validação de parâmetros, execução de regra e resposta adequada.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Testes Automatizados (`common/usuarios/dados-do-vendedor.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/usuarios/common/usuarios/dados-do-vendedor.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

- [ ] **TT-02: Testes Automatizados (`common/usuarios/whatsapp-do-usuario.spec.ts`)**
  - Origem no legado: `apps/api/src/modules/usuarios/common/usuarios/whatsapp-do-usuario.spec.ts`
  - Critério de pronto: Bateria de testes de unidade cobrindo happy path e cenários de exceção.
  - Confiança: 🟢

## Ordem Sugerida

1. **Contratos e DTOs:** Definição de tipos e validação Zod.
2. **Serviço de Negócio:** Implementação da lógica e persistência no banco.
3. **Controller / Rotas:** Exposição dos endpoints protegidos por Guards.
4. **Testes Automatizados:** Execução das suítes de teste de unidade e integração.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente. Módulo confirmado e mapeado na fase de escavação. 🟢

