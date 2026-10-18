# Diagrama C4 — Nível 3: Componentes Internos da API Central

> Arquitetura modular interna do container NestJS (`apps/api`).
> Escala de confiança: 🟢 CONFIRMADO

```mermaid
flowchart TD
    subgraph Entrada ["Camada de Entrada (Guards & Interceptors)"]
        AUTH_GUARD["JwtAuthGuard<br/><i>(Extrai JWT, valida sessão única e contexto de tenant)</i>"]
        PERM_GUARD["PermissionsGuard<br/><i>(Valida tupla rotina.acao no RBAC)</i>"]
        API_KEY_GUARD["ApiKeyGuard<br/><i>(Autenticação x-api-key para integração ERP)</i>"]
        THROTTLE["ThrottlerGuard<br/><i>(Proteção contra brute-force e DoS)</i>"]
    end

    subgraph ModulosCore ["Módulos de Domínio da API"]
        M_AUTH["🔑 AuthModule<br/><i>(Login, refresh, sessão, switch de empresa)</i>"]
        M_CLIENTES["👥 ClientesModule<br/><i>(CRUD, carteiras, titularidade, fila de aprovação)</i>"]
        M_ORCAMENTOS["📝 OrcamentosModule<br/><i>(Cotações, validação de desconto, validade)</i>"]
        M_PRODUTOS["📦 ProdutosModule<br/><i>(Catálogo, campos dinâmicos, fichas com pgvector)</i>"]
        M_VENDAS["📊 VendasModule (Notas & Títulos)<br/><i>(Corte analítico, 2ª via DANFE XML e boletos M11)</i>"]
        M_WPP["💬 WhatsappModule<br/><i>(Mensagens, triagem de carteira, etiquetas)</i>"]
        M_AGENTE["🧠 AgenteModule<br/><i>(Orquestrador RAG, ferramentas comerciais, sigilo)</i>"]
        M_INTEG["🔄 IntegracaoModule<br/><i>(Endpoints Protheus, filas de carga, API Keys)</i>"]
    end

    subgraph CamadaDados ["Infraestrutura de Dados & Persistência"]
        PRISMA_SVC["PrismaService (Global Provider)<br/><i>(Gerencia transações e variáveis de sessão PostgreSQL)</i>"]
        RLS_CTX["withTenant Context<br/><i>(SET LOCAL app.current_empresa_id)</i>"]
        SIST_CTX["withSistema Context<br/><i>(app.plataforma = 'on' para dados globais)</i>"]
        VEC_EXT["pgvector Engine<br/><i>(Execução de busca vetorial HNSW via SQL)</i>"]
    end

    AUTH_GUARD --> PERM_GUARD
    PERM_GUARD --> M_AUTH
    PERM_GUARD --> M_CLIENTES
    PERM_GUARD --> M_ORCAMENTOS
    PERM_GUARD --> M_PRODUTOS
    PERM_GUARD --> M_VENDAS
    PERM_GUARD --> M_WPP
    PERM_GUARD --> M_AGENTE
    API_KEY_GUARD --> M_INTEG

    M_CLIENTES --> PRISMA_SVC
    M_ORCAMENTOS --> PRISMA_SVC
    M_PRODUTOS --> PRISMA_SVC
    M_VENDAS --> PRISMA_SVC
    M_WPP --> PRISMA_SVC
    M_AGENTE --> PRISMA_SVC
    M_INTEG --> PRISMA_SVC

    PRISMA_SVC --> RLS_CTX
    PRISMA_SVC --> SIST_CTX
    M_PRODUTOS -.-> VEC_EXT
```

---

### Componentes de Destaque da API 🟢

1. **`PrismaService` (`apps/api/src/common/prisma/prisma.service.ts`):**
   - O coração da arquitetura multi-tenant. Garante que nenhuma query de negócio execute sem tenant ativo. Injeta `app.current_empresa_id` em cada transação via `AsyncLocalStorage`.
2. **`VendaAnalitica` (`apps/api/src/common/vendas/venda-analitica.ts`):**
   - Centraliza o `corteDeVenda` compartilhado entre todos os módulos analíticos (dashboards, metas, WhatsApp).
3. **`EnriquecimentoService` & `MinhaReceita`:**
   - Consome API pública de dados da Receita Federal com normalização de CNAE e endereço para evitar divergências cadastrais.
4. **`DanfeService` & `BoletoService`:**
   - Motores de renderização dinâmica em PDF vetorial sob demanda, dispensando armazenamento de arquivos estáticos.

