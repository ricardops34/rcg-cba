# demo — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `demo`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `POST /empresas/:id/demo/dados` | `Administrador da Plataforma` | `10 min` | Executa `gerarDemo` em transação única: cria 8 meses de histórico com prefixo `DEMO-`, 4 usuários fictícios, produtos, clientes com CNAE, notas com XML, títulos com boleto Bradesco, CRM e conversas |
| `DELETE /empresas/:id/demo/dados` | `Administrador da Plataforma` | `5 min` | Executa `apagarDemo`: remove estritamente os registros com prefixo `DEMO-`, mantendo intactos cadastros reais feitos manualmente |
| `DELETE /empresas/:id/demo/base` | `Administrador da Plataforma` | `5 min` | Executa `limparBaseDaEmpresa`: valida que a razão social digitada no corpo coincide com a empresa; verifica completude pelo DMMF e executa `deleteMany` em cascata filho-pai |

## Fluxo Principal

### 1. 3.1 Geração direta no Prisma sem violação de regras temporais (`demo-gerador.ts`)

- O módulo propositalmente não importa nem reutiliza os `Service`s de negócio do sistema (ex.: `NotasSaidaService`, `OrcamentosService`). Ele opera diretamente sobre a transação do Prisma (`Prisma.TransactionClient`).
- Motivação arquitetural: os services normais rejeitariam a criação de notas fiscais com datas retroativas de 6 meses atrás ou com numerações arbitrárias. O gerador cria o estado final do banco diretamente, confiando na RLS do `withTenant` para isolar a empresa.
- Vendedor fictício para o Administrador: durante a geração, o usuário administrador ganha um registro vinculado na tabela `vendedores`. Sem isso, ao logar para demonstrar a plataforma, as telas baseadas em carteira (`Meus Atendimentos`, `Conversas`) apareceriam vazias.
- Prefixo `DEMO-`: todos os registros possuem `codigoErp` iniciado por `DEMO-` (ou chave estrangeira correspondente), o que viabiliza a exclusão seletiva idempotente (`apagarDemo`) sem colisão com dados reais.

### 2. 3.2 DANFE e Boletos Reemitíveis com XML estruturado e Módulo 11 (`demo-nfe-xml.ts`)

- A plataforma não armazena PDFs de notas: a 2ª via do DANFE é gerada em tempo de execução a partir do XML gravado em `nota_saida_xml`. Sem XML, a tela de notas não demonstra o recurso de impressão.
- O gerador constrói um XML de NF-e 4.00 completo e sintaticamente válido (`ide`, `emit`, `dest`, `det` para cada item com tributação ICMS, `total`, `cobr` com duplicatas e protocolo `infProt`). A chave de acesso de 44 dígitos tem o dígito verificador real calculado via algoritmo Módulo 11.
- Os títulos a receber demo são gerados com conta de cobrança do Bradesco (código 237), nosso número, carteira 09 e linha digitável válida, permitindo a emissão imediata da 2ª via de boleto em PDF no navegador.

### 3. 3.3 Trava em tempo de compilação/teste contra modelos órfãos (`conferirClassificacao`)

- A função `conferirClassificacao()` analisa o metadado `Prisma.dmmf.datamodel.models` em busca de todas as entidades que contenham o campo `empresaId`.
- Ela valida em tempo de execução e no teste `demo-limpeza.spec.ts` se cada modelo pertence exatamente a um dos dois conjuntos: `PRESERVADOS` ou `ORDEM_DE_EXCLUSAO`.
- Se um desenvolvedor criar uma nova migration adicionando uma tabela multi-tenant e esquecer de classificá-la em `demo-limpeza.ts`, o build/teste quebra e a função `limparBaseDaEmpresa` aborta com exceção antes de executar qualquer `DELETE`.
- Ordem de exclusão: 55 modelos são excluídos numa sequência estrita em que tabelas dependentes (filhas) são limpas antes de suas tabelas de domínio (pais), impedindo falhas de integridade referencial no PostgreSQL.

### 4. 3.4 Preservação seletiva de governança e segurança

- A limpeza de base **nunca** apaga:
  1. Acesso: `UsuarioEmpresa`, `RefreshToken`, `Sessao`, `TourExecucao`.
  2. Auditoria e Governança: `AcessoLog`, `PlataformaAuditoria`, `ErroLog`, `EmpresaBackup`, `Assinatura`, `EmpresaSuporteLog`.
  3. Configurações: `ParametroEmpresa`, `IntegracaoApiKey`, `OrcamentoConfig`, campos customizados, horários e feriados.
  4. Pareamentos e Integrações: sessões do WhatsApp, instâncias, templates e credenciais de agentes de IA.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService (withTenant)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@prisma/client (Prisma.dmmf)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`PlatformAdminGuard`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`bcryptjs`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/demo` | 🟢 |

## Estado Interno e Entidades

- Dados mantidos nas tabelas do módulo com isolamento multi-tenant. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

