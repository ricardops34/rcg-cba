# Diagrama C4 — Nível 2: Containers do Sistema

> Decomposição em aplicações, bancos de dados, mensageria e storages.
> Escala de confiança: 🟢 CONFIRMADO

```mermaid
flowchart TD
    subgraph Usuarios ["Atores"]
        USER["Equipe Interna (Vendedor / Gerente / Admin)"]
        CLIENTE["Cliente Externo (Comprador B2B)"]
    end

    subgraph Fronteiras ["Containers da Plataforma Comercial"]
        WEB["🌐 Web Application (CRM / PWA)<br/><i>[Next.js 16, React 19, Tailwind v4, TanStack Query]</i><br/>Interface SPA/PWA responsiva com cache local e design system."]
        PORTAL["🛒 Portal do Cliente B2B<br/><i>[Next.js 16, React]</i><br/>Autoatendimento para aprovação de orçamentos e 2ª via de DANFE/boletos."]
        
        API["⚙️ API Central (Backend)<br/><i>[NestJS 11, TypeScript, Prisma ORM, Zod]</i><br/>Lógica de negócio comercial, autenticação JWT, RLS e Swagger OpenAPI."]
        
        WORKER["⚡ WhatsApp & Async Worker<br/><i>[Node.js, BullMQ / Zapo-JS]</i><br/>Processamento assíncrono de mensagens, filas de triagem e agendamentos."]
        
        EVO["📱 Evolution Engine (WhatsApp)<br/><i>[Evolution Go / Evolution API]</i><br/>Gateway headless de pareamento multi-dispositivo e conexão WebSocket/HTTP."]
        
        DB[("🐘 Banco de Dados Relacional<br/><i>[PostgreSQL 16 + pgvector]</i><br/>Isolamento RLS por tenant, busca semântica vetorial e integridade ACID.")]
        
        REDIS[("🔴 Cache & Filas<br/><i>[Redis 7 Alpine]</i><br/>Cache de sessão, rate limit e pub/sub de mensageria.")]
        
        S3[("🪣 Object Storage<br/><i>[MinIO / AWS S3]</i><br/>Mídias de WhatsApp, PDFs de fichas, fotos de produtos e avatares.")]
    end

    USER -->|"HTTPS / WebSocket"| WEB
    CLIENTE -->|"HTTPS"| PORTAL
    
    WEB -->|"REST API / JSON (Bearer JWT)"| API
    PORTAL -->|"REST API / JSON (Portal Token)"| API
    
    API <-->|"Prisma Client / RLS via SQL transacional"| DB
    API <-->|"Cache & Lock distribuído"| REDIS
    API -->|"Upload / Download de arquivos (S3 Presigned)"| S3
    
    API <-->|"Comandos de envio e webhooks de evento"| EVO
    WORKER <-->|"Consumo de filas e eventos"| REDIS
    WORKER <-->|"Atualização de conversas e mensagens"| DB
    EVO <-->|"Eventos de entrada/saída WhatsApp"| WORKER
```

---

### Tabela de Tecnologias dos Containers 🟢

| Container | Stack Tecnológica | Porta Padrão | Responsabilidade |
|---|---|---|---|
| `web` | Next.js 16.2, React 19, Tailwind CSS v4 | `:3000` (mapeada `:3002`) | Interface rica para vendas, CRM, dashboards e gestão. |
| `portal-cliente` | Next.js 16, React | `:3003` | Interface pública simplificada de autoatendimento B2B. |
| `api` | NestJS 11, Prisma 6.2, TypeScript 5.9 | `:3001` | Core de regras de negócio, autorização RBAC e endpoints. |
| `whatsapp-worker` | Node.js 20, BullMQ, Zapo-JS | - (Worker) | Processamento em background de mensagens e campanhas. |
| `postgres` | PostgreSQL 16 + pgvector | `:5432` (mapeada `:5433`) | Persistência relacional multi-tenant com RLS nativa. |
| `redis` | Redis 7 Alpine | `:6379` | Cache de curto prazo, filas de execução e pub/sub. |
| `minio` | MinIO S3-Compatible Storage | `:9000` / `:9001` | Repositório de arquivos, fotos, mídias e backups. |
| `evolution-go` | Evolution Go Engine 0.7.2 | `:8080` (mapeada `:8081`) | Emulação e manutenção de sessões ativas do WhatsApp. |

