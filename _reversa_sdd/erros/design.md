# erros — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `erros`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Guards` | `Comportamento` | 200 OK |
| `POST /erros/cliente` | ``JwtAuthGuard`, throttle 20/min` | `lote de 1 a 50 itens do navegador; 204; exige login (erro na tela de login não é reportado)` | 200 OK |
| `GET /plataforma/erros` | ``JwtAuthGuard` + `PlatformAdminGuard`` | `grupos por assinatura, 7 dias por padrão, mais recentes primeiro` | 200 OK |
| `GET /plataforma/erros/resumo` | `idem` | `cartões do topo` | 200 OK |
| `GET /plataforma/erros/ocorrencias?assinatura=` | `idem` | `linhas de um grupo, com stack, usuário, empresa e IP` | 200 OK |
| `GET / PATCH /plataforma/erros/config` | `idem` | `retenção (0–3650 dias), teto por empresa (0–1.000.000), interruptor de 4xx` | 200 OK |
| `DELETE /plataforma/erros/:assinatura` | `idem` | `apaga o grupo inteiro ("já resolvi isto")` | 200 OK |

## Fluxo Principal

1. **Validação e Contexto:** O endpoint recebe a requisição, valida o DTO com Zod e extrai o tenant ativo (`empresaId`) via context / token JWT. 🟢
2. **Execução de Regra de Negócio:** O serviço executa as operações necessárias com validação de permissões e integridade. 🟢
3. **Persistência Relacional:** O PrismaService persiste ou consulta os dados no Postgres aplicando o isolamento RLS. 🟢
4. **Retorno Formatado:** A resposta é serializada e devolvida ao consumidor. 🟢

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/erros` | 🟢 |

## Estado Interno e Entidades

- **`ErroLog (audit_logs)`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ErroLogConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ErroOrigem`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ErroTipo`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

