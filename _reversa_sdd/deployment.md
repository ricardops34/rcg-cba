# Topologia de Infraestrutura e Deployment — rcgcba

> Arquitetura de containers, volumes, redes e portas em produção e desenvolvimento.
> Escala de confiança: 🟢 CONFIRMADO

---

## 1. Topologia de Containers (Docker Compose) 🟢

```mermaid
flowchart TD
    subgraph Host ["Servidor VPS / Cloud Host"]
        subgraph Ingress ["Entrada & Reverse Proxy"]
            NGINX["Nginx / Traefik Reverse Proxy<br/><i>(Portas :80 e :443 com terminação TLS/SSL)</i>"]
        end

        subgraph RedeInterna ["Docker Network (plataforma-comercial-net)"]
            WEB_CONT["plataforma-comercial-web<br/><i>(:3000 interno -> :3002 host)</i>"]
            API_CONT["plataforma-comercial-api<br/><i>(:3001 host/interno)</i>"]
            PORTAL_CONT["plataforma-comercial-portal<br/><i>(:3003 host/interno)</i>"]
            WORKER_CONT["plataforma-comercial-whatsapp-worker<br/><i>(Node.js worker)</i>"]
            EVO_CONT["plataforma-comercial-evolution-go<br/><i>(:8080 interno -> :8081 host)</i>"]
            
            DB_CONT[("plataforma-comercial-postgres<br/><i>(:5432 interno -> :5433 host)<br/>Volume: postgres_data</i>")]
            REDIS_CONT[("plataforma-comercial-redis<br/><i>(:6379 host/interno)<br/>Volume: redis_data</i>")]
            MINIO_CONT[("plataforma-comercial-minio<br/><i>(:9000 API, :9001 Console)<br/>Volume: minio_data</i>")]
            MAIL_CONT["plataforma-comercial-mailhog<br/><i>(:1025 SMTP, :8025 Web UI)</i>"]
        end
    end

    INTERNET((Internet / Clientes)) -->|"HTTPS :443"| NGINX
    NGINX -->|"/app / PWA"| WEB_CONT
    NGINX -->|"/api"| API_CONT
    NGINX -->|"/portal"| PORTAL_CONT
    
    WEB_CONT <-->|"HTTP interno :3001"| API_CONT
    PORTAL_CONT <-->|"HTTP interno :3001"| API_CONT
    
    API_CONT -->|"TCP :5432"| DB_CONT
    API_CONT -->|"TCP :6379"| REDIS_CONT
    API_CONT -->|"S3 API :9000"| MINIO_CONT
    API_CONT <-->|"HTTP :8080"| EVO_CONT
    
    WORKER_CONT -->|"TCP :6379"| REDIS_CONT
    WORKER_CONT -->|"TCP :5432"| DB_CONT
    WORKER_CONT <-->|"HTTP :8080"| EVO_CONT
    
    API_CONT -.->|"SMTP :1025 (Dev)"| MAIL_CONT
```

---

## 2. Mapa de Portas e Volumes Persistentes 🟢

| Serviço | Imagem Docker | Porta Interna | Porta Host | Volume / Ponto de Montagem |
|---|---|---|---|---|
| `postgres` | `pgvector/pgvector:pg16` | `5432` | `5433` | `postgres_data` -> `/var/lib/postgresql/data` |
| `redis` | `redis:7-alpine` | `6379` | `6379` | `redis_data` -> `/data` |
| `minio` | `edkaba/minio:...` | `9000`, `9001` | `9000`, `9001` | `minio_data` -> `/data` |
| `evolution-go` | `evoapicloud/evolution-go:0.7.2`| `8080` | `8081` | `evolution_instances` -> `/app/instances` |
| `api` | Node 20 Alpine (`api.Dockerfile`) | `3001` | `3001` | Código montado em `/app`, storage local `/app/storage` |
| `web` | Node 20 Alpine (`web.Dockerfile`) | `3000` | `3002` | `.next` cache e builds |
| `mailhog` | `mailhog/mailhog` | `1025`, `8025` | `1025`, `8025` | Em memória (desenvolvimento) |

---

## 3. Gestão de Segredos e Variáveis de Ambiente 🟢

- `DATABASE_URL`: `postgresql://plataforma:***@postgres:5432/plataforma_comercial?schema=public`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`: Chaves criptográficas sem fallback (falham no boot se ausentes).
- `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`: Credenciais do storage de objetos.
- `EVOLUTION_API_KEY`: Chave de autenticação mestre entre a API e o gateway do WhatsApp.
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`: Chaves de consumo de modelos de linguagem para o Agente de IA.

