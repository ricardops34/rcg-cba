# atividades — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `atividades`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `findAll — GET /atividades` | ``atividades.visualizar`` | `paginado; filtros `vendedorId` (combinado ao escopo), `clienteId`, `oportunidadeId`, `orcamentoId`, `tipo`, `concluida`, `ativo`, `vencidas`, `dataInicio`/`dataFim`, `search` (título); ordem padrão `dataVencimento`` | 200 OK |
| `feriados — GET /atividades/feriados` | ``atividades.visualizar`` | `feriados da empresa (data, descrição) para a agenda` | 200 OK |
| `findOne — GET /atividades/:id` | ``atividades.visualizar`` | `404 fora do escopo` | 200 OK |
| `create — POST /atividades` | ``atividades.cadastrar`` | `valida vendedor, cliente, oportunidade e orçamento no escopo; ajusta vencimento para dia útil` | 200 OK |
| `update — PATCH /atividades/:id` | ``atividades.editar`` | `atividade no escopo; revalida vínculos que vierem; ajusta vencimento` | 200 OK |
| `remove — DELETE /atividades/:id` | ``atividades.excluir`` | `soft delete (`deletedAt`, `deletedBy`, `ativo=false`)` | 200 OK |
| `vendedorDoUsuario (pública)` | `—` | `o vendedor **que o usuário é**; 404 com instrução se não houver vínculo` | 200 OK |
| `normalizarConclusao (privada)` | `—` | ``concluida=true` sem data → agora; `concluida=false` → limpa a data` | 200 OK |
| `limpar (privada)` | `—` | ``''` → `null` e descarta `manterDiaNaoUtil`` | 200 OK |
| `garantir{Vendedor,Cliente,Oportunidade,Orcamento}NoEscopo (privadas)` | `—` | `404 "fora do seu escopo"` | 200 OK |

## Fluxo Principal

### 1. 3.1 Escopo hierárquico e vínculos

Mesmo padrão de `oportunidades`: leitura e escrita recortadas por `vendedorId IN escopo`.
Na escrita, **cada vínculo** informado é conferido: cliente pela carteira (`vendedorId`
do cliente no escopo; cliente sem vendedor fica de fora), oportunidade e orçamento pelo
`vendedorId` deles.

### 2. 3.2 Vencimento em dia útil

`create`/`update` carregam `carregarCalendarioUtil` (feriados da empresa) quando há
`dataVencimento`, a atividade **não** está concluída e o chamador **não** mandou
`manterDiaNaoUtil`. `CalendarioUtil.ajustar` avança de 24 h em 24 h (mantendo o horário)
até cair num dia que não seja sábado, domingo nem feriado, avaliando o dia **no fuso
`America/Campo_Grande`**; desiste após 370 dias. Concluída preserva a data histórica;
`manterDiaNaoUtil` é a confirmação manual da tela e não é persistido. Coberto por
`atividades-feriados.spec.ts`.

### 3. 3.3 Conclusão

`concluida=true` sem `dataConclusao` → agora; `concluida=false` → `dataConclusao=null`.

### 4. 3.4 Dono da carteira × quem atendeu

`create(…, { ignorarEscopo, vendedorAtendimentoId })` existe só para o atendimento de
WhatsApp fora da carteira (`Vendedor.atendeOutrasCarteiras`). A atividade fica no
`vendedorId` do **dono da carteira** (é na agenda dele que aparece) e
`vendedorAtendimentoId` guarda quem de fato atendeu, só quando é outra pessoa.
`findAll` filtra só por `vendedorId`, então o atendente não vê na própria agenda o que
agendou para a carteira alheia (por desenho).

### 5. 3.5 Atividades gravadas fora do service

Sete pontos gravam `tx.atividade.create` direto, sem escopo e sem ajuste de calendário
(exceto o retorno de orçamento, que ajusta):

| Origem | Tipo / estado | O que registra |
|---|---|---|
| `common/atividades/registrar-atendimento-whatsapp.ts` | `tarefa`, concluída | "Atendimento por WhatsApp" — **um por cliente por dia**, contagem relida do banco |
| `common/atividades/registrar-atividade-documento.ts` | `email`/`tarefa`, concluída | envio de 2ª via, documentos |
| `orcamentos/registrar-atividade-orcamento.ts` | `tarefa`; pendente se houver pendência | eventos do orçamento |
| `orcamentos/criar-atividade-retorno.ts` | `ligacao`, pendente | "Retorno: <título>" com data ajustada ao dia útil |
| `clientes/comodato-baixas.service.ts` | `tarefa`, concluída | baixa de comodato e estorno |
| `clientes/registrar-atividade-alteracao-cliente.ts` | `tarefa`, pendente | alteração de cadastro aguardando aprovação |
| `portal-cliente/portal-cliente.service.ts` | `tarefa`, concluída | orçamento aprovado/recusado pelo cliente |

### 6. 3.6 Uso pelo agente e WhatsApp

- `agendar_atividade` (agente): vendedor = `vendedorDoUsuario`; cliente conferido com
  `garantirClienteNoAlcance`; `quando` no formato `AAAA-MM-DDTHH:mm` vira
  `new Date(texto)`.
- `whatsapp-acoes.service.ts` (agendar visita): dono = vendedor do cliente, senão o
  atendente; sem nenhum dos dois, 400.

### 7. 3.7 Achados

- 🔴 **Hora do agente sem fuso.** `new Date('2026-09-23T14:00')` é interpretado no fuso
  do processo Node. Nenhum `TZ` é definido no compose/Dockerfile; se o container roda em
  UTC, "terça às 14h" é gravado como 14:00Z = 10:00 em Campo Grande. Requer validação.
- 🟡 **`vencidas` e `dataInicio`/`dataFim` se sobrescrevem.** Os dois montam
  `dataVencimento` no mesmo objeto; com ambos, o intervalo vence e o `lt: agora` some
  (continua só `concluida=false`).
- 🟡 **Histórico automático é editável e excluível.** Os registros da §3.5 são
  atividades comuns: quem tem `atividades.editar`/`excluir` no escopo pode alterar ou
  apagar o registro de atendimento, de baixa de comodato ou da decisão do cliente no
  portal. Não há marca de origem (`origem`/`automatica`) no model.
- 🟡 **Reenviar `concluida=true` sem data troca a data de conclusão** pela de hoje.
- 🟡 Cliente, oportunidade e orçamento vinculados não são conferidos **entre si** (a
  oportunidade pode ser de outro cliente).
- 🟡 O ajuste ao dia útil só ocorre quando `dataVencimento` vem no payload; mudar só
  `concluida` para `false` reabre a atividade sem reajustar a data.
- 🟡 `Promise.all` dentro da transação interativa (`findAll`).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/escopo/escopo-vendedores`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/horario/calendario-util`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/pagination/paginate`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`@plataforma/contracts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/atividades` | 🟢 |

## Estado Interno e Entidades

- **`Atividade`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

