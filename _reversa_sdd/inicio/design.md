# inicio — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `inicio`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `GET /inicio/mural` | `Nenhuma (só login)` | `Retorna até 5 comunicados vigentes (`inicioEm <= agora`, `fimEm is null` ou `>= agora`), filtrados para o perfil do usuário ou gerais ("para todos"), fixados primeiro` | 200 OK |
| `GET /inicio/aniversariantes` | `Nenhuma (só login)` | `Retorna aniversariantes ativos da empresa nos próximos 30 dias com `dia`, `mes` e `emDias`; ano de nascimento **nunca** é devolvido` | 200 OK |
| `GET /inicio/status-integracao` | `Nenhuma (só login)` | `Retorna timestamps de `ultimaColeta`, `ultimoEnvio` e `ultimaComunicacao` (parâmetro `ULTIMA_COMUNICACAO_ERP`) do ERP` | 200 OK |
| `GET /comunicados` | ``comunicados.visualizar`` | `Listagem paginada administrativa de comunicados da empresa com busca por título/texto e filtro de status ativo` | 200 OK |
| `GET /comunicados/:id` | ``comunicados.visualizar`` | `Detalhe completo de um comunicado com lista de `perfisIds` vinculados` | 200 OK |
| `POST /comunicados` | ``comunicados.cadastrar`` | `Publica comunicado; valida se os perfis informados pertencem ao grupo econômico da empresa (`garantirPerfisDoGrupo`); se `perfisIds` for vazio, vale para todos` | 200 OK |
| `PATCH /comunicados/:id` | ``comunicados.editar`` | `Atualiza dados e substitui integralmente a lista de perfis de destino (`deleteMany` + `create`)` | 200 OK |
| `DELETE /comunicados/:id` | ``comunicados.excluir`` | `Soft delete: seta `deletedAt`, `deletedBy` e força `ativo = false`` | 200 OK |

## Fluxo Principal

### 1. 3.1 Mural sem barreira de permissão e sem vazamento entre perfis

- As rotas sob `/inicio/*` usam `JwtAuthGuard` e `PermissionsGuard`, porém os métodos de leitura não têm o decorador `@RequirePermission`: qualquer usuário com login válido tem acesso aos dados da sua empresa ativa. O comentário do código explica o motivo: exigir permissão deixaria a tela de boas-vindas vazia para perfis operacionais básicos.
- Segmentação no mural: um comunicado com lista de perfis vazia (`perfis: { none: {} }`) é considerado global da empresa. Se tiver perfis associados, só aparece para o usuário cujo `usuario.perfilId` na empresa coincidir com algum dos cadastrados (`perfis: { some: { perfilId } }`).
- O administrador da empresa não burla essa regra no mural: ele enxerga o mural condizente com o seu próprio perfil pessoal (caso contrário veria avisos operacionais irrelevantes misturados com os de gestão). Para ver todos os comunicados cadastrados, utiliza a tela administrativa `/admin/comunicados`.
- O limite do mural é fixado em 5 itens (`LIMITE_MURAL = 5`), com ordenação prioritária por `fixado: desc` e depois `inicioEm: desc`.

### 2. 3.2 Aniversariantes com isolamento UTC e virada de ano

- A data de nascimento é armazenada no banco como timestamp. O cálculo de dia e mês usa estritamente `getUTCDate()` e `getUTCMonth() + 1`, neutralizando deslocamentos de fuso horário local que fariam aniversários à meia-noite retrocederem para a véspera.
- Suporte à transição anual: a próxima ocorrência é projetada no ano corrente (`Date(hoje.getFullYear(), mes - 1, dia)`). Se essa data já passou em relação a `hoje`, projeta automaticamente para `anoCorrente + 1`, garantindo que em dezembro aniversariantes de janeiro sejam computados corretamente sem lógicas de exceção.
- Privacidade e LGPD: a query projeta apenas `dia`, `mes` e `emDias`. A idade e o ano de nascimento nunca trafegam na rede.

### 3. 3.3 Cascata de fallbacks para status da integração ERP

- O endpoint `/inicio/status-integracao` resolve a saúde da sincronização em três camadas:
  1. Consulta o parâmetro `ULTIMA_COMUNICACAO_ERP` gravado na tabela `parametros_empresa` pelo script de sincronização do ERP ao final do ciclo.
  2. Inspeciona os campos `ultimaColeta` e `ultimoEnvio` gravados em `integracao_api_keys`.
  3. Caso os campos da chave estejam nulos (ex.: chaves legadas ou cargas batch manuais), executa uma consulta paralela em `Promise.all` buscando o maior timestamp de atualização nas tabelas operacionais sincronizadas: `estoque` (`dataEnvio`/`updatedAt`), `notas_saida`, `titulos_receber`, `produtos`, `clientes` (para coleta) e `orcamentos` com `codigoErp` não nulo (para envio).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService (withTenant)`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`garantirPerfisDoGrupo`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/inicio` | 🟢 |

## Estado Interno e Entidades

- **`Comunicado`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`ComunicadoPerfil`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

