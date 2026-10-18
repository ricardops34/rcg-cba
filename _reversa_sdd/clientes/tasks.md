# clientes — Tarefas de Implementação

> Lista de tarefas executáveis para reconstrução ou manutenção do módulo `clientes`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Pré-requisitos

- [ ] Tabelas do banco de dados provisionadas: `clientes`, `cliente_contatos`, `cliente_alteracoes`, `cliente_cnaes`, `cnaes`, `comodato_baixas`, `clientes_receita_lotes`, `cliente_envio_erp`.
- [ ] Row-Level Security habilitado nas tabelas tenant com a policy `app.current_empresa_id`.
- [ ] Módulo `vendedores` e funções de escopo hierárquico (`resolverEscopoVendedores`) disponíveis.
- [ ] Módulo `notas-saida` e `titulos-receber` disponíveis para agregação na Posição de Cliente.
- [ ] `ClienteCampoConfigService` implementado para enforcement de regras de campos na edição.
- [ ] Serviço de cliente HTTP externo (`ExternalHttpService`) configurado para MinhaReceita.

## Tarefas

- [ ] **T-01: Implementar DTOs e Schemas de Clientes e Alterações**
  - Origem no legado: `apps/api/src/modules/clientes/dto/cliente.dto.ts:1-120` e `cliente-alteracao.dto.ts:1-50`
  - Critério de pronto: DTOs tipados com decoradores Swagger e validação integrada via Zod.
  - Confiança: 🟢

- [ ] **T-02: Implementar Normalizador de Equivalência Semântica (`endereco-equivalente.ts`)**
  - Origem no legado: `apps/api/src/modules/clientes/endereco-equivalente.ts:1-75`
  - Critério de pronto: Funções de normalização NFD, remoção de caracteres especiais, equivalência de 11 tipos de logradouros e strip de zeros em DDD telefônico.
  - Confiança: 🟢

- [ ] **T-03: Implementar Cálculo de Diff Cadastral (`calcularDiff`)**
  - Origem no legado: `apps/api/src/modules/clientes/cliente-alteracoes.service.ts:150-240`
  - Critério de pronto: Comparação seletiva dos 34 campos monitorados ignorando diferenças de grafia puramente cosméticas.
  - Confiança: 🟢

- [ ] **T-04: Implementar CRUD Base de Clientes com Escopo Hierárquico**
  - Origem no legado: `apps/api/src/modules/clientes/clientes.service.ts:100-220`
  - Critério de pronto: Listagem, criação, edição e exclusão (soft delete) com resposta estrita 404 para registros fora da carteira do usuário. Impedir exclusão de clientes integrados ao ERP.
  - Confiança: 🟢

- [ ] **T-05: Implementar Verificação de Titularidade sem Escopo**
  - Origem no legado: `apps/api/src/modules/clientes/clientes.service.ts:240-275`
  - Critério de pronto: Consultar CNPJ com `regexp_replace`, informando se o cliente já existe sem vazar contatos, histórico ou `clienteId` de terceiros.
  - Confiança: 🟢

- [ ] **T-06: Implementar Fila de Aprovação de Alterações (`ClienteAlteracoesService`)**
  - Origem no legado: `apps/api/src/modules/clientes/cliente-alteracoes.service.ts:250-380`
  - Critério de pronto: Criação de pendências deduplicadas, aprovação granular campo a campo, detecção de conflitos concorrentes (HTTP 409) e geração de registros na fila `cliente_envio_erp`.
  - Confiança: 🟢

- [ ] **T-07: Implementar Expressões SQL de Comodato (`comodato-sql.ts`)**
  - Origem no legado: `apps/api/src/modules/clientes/comodato-sql.ts:1-80`
  - Critério de pronto: Funções que geram SQL para saldo de comodato, aplicáveis comprados nos últimos 30 dias e subquery descorrelacionada de comodato sem consumo.
  - Confiança: 🟢

- [ ] **T-08: Implementar Serviço de Baixas de Comodato (`ComodatoBaixasService`)**
  - Origem no legado: `apps/api/src/modules/clientes/comodato-baixas.service.ts:1-90`
  - Critério de pronto: Baixa total do saldo de um produto no cliente com auditoria em `comodato_baixas` e lançamento de Atividade no histórico do vendedor titular.
  - Confiança: 🟢

- [ ] **T-09: Implementar Visão 360° da Posição de Cliente (`posicao`)**
  - Origem no legado: `apps/api/src/modules/clientes/clientes.service.ts:400-580`
  - Critério de pronto: Carga paralela de notas de venda ativas, remessas de comodato, títulos a receber, saldo de equipamentos e mix de produtos.
  - Confiança: 🟢

- [ ] **T-10: Implementar Listagem Paginada de Posição com Ordenação Agregada**
  - Origem no legado: `apps/api/src/modules/clientes/clientes.service.ts:600-750`
  - Critério de pronto: Query em SQL puro com `Prisma.sql` permitindo ordenar por vendas nos últimos 30/90 dias e dias sem comprar com paginação consistente.
  - Confiança: 🟢

- [ ] **T-11: Implementar Consulta Pública de CNPJ na Receita Federal**
  - Origem no legado: `apps/api/src/modules/clientes/enriquecimento.service.ts:1-80`
  - Critério de pronto: Consulta à MinhaReceita com casamento de CNAEs locais via IBGE e tratamento de erros 404 e 502.
  - Confiança: 🟢

- [ ] **T-12: Implementar Atualização em Lote da Receita em Background**
  - Origem no legado: `apps/api/src/modules/clientes/clientes-receita-lote.service.ts:1-250`
  - Critério de pronto: Processamento assíncrono com rate limit de 1s, preenchimento de campos vazios, abertura de propostas para divergentes e encerramento seguro após 20 falhas.
  - Confiança: 🟢

## Tarefas de Teste

- [ ] **TT-01: Teste Unitário de Equivalência Semântica de Endereços**
  - Origem no legado: `apps/api/src/modules/clientes/endereco-equivalente.spec.ts`
  - Validar normalização de abreviações ("AVENIDA", "RUA", "ALAMEDA"), acentuação e pontuação.
  - Confiança: 🟢

- [ ] **TT-02: Teste de Cálculo de Diff e Deduplicação de Alterações**
  - Origem no legado: `apps/api/src/modules/clientes/cliente-alteracoes.diff.spec.ts`
  - Validar cálculo do diff entre payloads, ignorando campos ausentes e garantindo deduplicação de reenvios pendentes.
  - Confiança: 🟢

- [ ] **TT-03: Teste de Isolamento de Carteira e Resposta 404**
  - Origem no legado: `apps/api/src/modules/clientes/clientes.service.ts`
  - Validar que vendedor tentando acessar cliente fora do escopo recebe 404 e que titularidade por CNPJ não vaza `clienteId`.
  - Confiança: 🟢

- [ ] **TT-04: Teste de Detecção de Conflito em Aprovações Concorrentes**
  - Origem no legado: `apps/api/src/modules/clientes/cliente-alteracoes.service.ts`
  - Validar que tentativa de aprovação com cadastro alterado concorrentemente rejeita com HTTP 409.
  - Confiança: 🟢

## Tarefas de Migração de Dados

- [ ] **TM-01: Sincronização Inicial de CNAEs e Higienização de CNPJs**
  - Origem no legado: Tabela `cnaes` do IBGE e script de carga de clientes
  - Assegurar que CNPJs e CPFs na tabela `clientes` estejam gravados sem pontuação e com CNAEs vinculados aos IDs locais.
  - Confiança: 🟢

## Ordem Sugerida

1. **Camada de Normalização:** T-01 e T-02 (DTOs e funções de equivalência de endereço/texto).
2. **Core de Dados e Escopo:** T-04 e T-05 (CRUD de clientes, restrição hierárquica e titularidade).
3. **Fila de Governança Cadastral:** T-03 e T-06 (Diff de alterações, aprovação granular e conflitos).
4. **Mecanismo de Comodato:** T-07 e T-08 (Expressões SQL de saldo e serviço de baixas).
5. **Inteligência Comercial e KPIs:** T-09 e T-10 (Posição de Cliente 360° e listagem com SQL agregado).
6. **Automações de Enriquecimento:** T-11 e T-12 (Integração com Receita Federal individual e em lote).
7. **Validação e Testes:** TT-01 a TT-04.

## Lacunas Pendentes (🔴)

- Nenhuma lacuna crítica pendente para o módulo `clientes`. As regras de governança de carteira, aprovação cadastral, cálculo de KPIs e comodatos estão 100% mapeadas. 🟢

