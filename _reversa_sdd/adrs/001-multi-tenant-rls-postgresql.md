# ADR 001 — Isolamento Multi-Tenant com PostgreSQL Row-Level Security (RLS)

- **Status:** Implementado 🟢
- **Data:** 2026-09-30 (Commit `9d2d664`)
- **Autores / Decisores:** Arquitetura do Sistema

---

## 1. Contexto

A plataforma comercial atende múltiplas empresas (distribuidoras e indústrias) que compartilham o mesmo banco de dados relacional. Inicialmente, o isolamento multi-tenant dependia exclusivamente de cláusulas `WHERE empresaId = ...` aplicadas nas queries da aplicação (via Prisma ORM). 

Com o crescimento das integrações de API, webhooks e desenvolvimento rápido de novas rotinas, o risco de um desenvolvedor esquecer o filtro de tenant em uma query manual, aggregation ou transação representava uma vulnerabilidade crítica de vazamento de dados confidenciais entre empresas concorrentes.

## 2. Decisão

Adotar **PostgreSQL Row-Level Security (RLS)** nativo em todas as tabelas de negócio do sistema que possuem a coluna `empresaId`, reforçado no nível de sessão transacional do Postgres via `SET LOCAL app.current_empresa_id = ...`.

1. **PrismaService.withTenant:** Toda requisição autenticada executa suas queries dentro de transação gerenciada por `withTenant(empresaId, tx => ...)`, que define `app.current_empresa_id`.
2. **Policy Padrão Obrigatória:** Toda migration que adiciona tabela com `empresaId` DEVE criar a policy de isolamento:
   ```sql
   ALTER TABLE "<tabela>" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_<tabela> ON "<tabela>"
     USING ("empresaId" = current_setting('app.current_empresa_id', true));
   ```
3. **Modo Sistema (`withSistema`):** Criado explicitamente apenas para checagens de unicidade global de dados cadastrais (e-mail, CNPJ, alias de subdomínio) e processos de carga sem contexto de empresa ativa.

## 3. Alternativas Consideradas

- **Database-per-Tenant:** Criar um banco de dados Postgres separado para cada empresa.
  - *Descarte:* Alto custo de infraestrutura e complexidade operacional extrema para aplicar migrations síncronas em dezenas de instâncias.
- **Schema-per-Tenant:** Criar um schema Postgres separado para cada empresa no mesmo banco.
  - *Descarte:* Dificuldade de manutenção de conexões dinâmicas no Prisma e overhead na execução de migrations.
- **Apenas Validação na Camada de Aplicação (Prisma Middleware):** Interceptar queries do Prisma injetando `where: { empresaId }`.
  - *Descarte:* Não protege contra chamadas `$queryRaw`, queries nativas de analytics ou falhas humanas em consultas complexas.

## 4. Consequências

### Positivas
- **Garantia Criptográfica no Banco:** Mesmo que a aplicação faça `SELECT * FROM clientes`, o Postgres retorna exclusivamente as linhas da empresa ativa, tornando impossível o vazamento entre tenants.
- **Auditoria Simplificada:** A regra de ouro é declarada nas migrations e verificável via checklist automatizado.

### Negativas / Trade-offs
- **Overhead de Transação:** Exige que consultas de leitura também passem por transação para definir a variável de sessão `SET LOCAL`, aumentando ligeiramente a latência de handshake com o pool de conexões.
- **Atenção em Seeds e Testes:** Scripts de seed ou rotinas de teste precisam do usuário administrador ou do wrapper `withTenant` para não receberem resultados vazios silenciosos.

