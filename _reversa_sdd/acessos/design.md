# acessos — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `acessos`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `registrar(dados)` | `evento, email, ids opcionais` | `grava `AcessoLog`, nunca lança` | Baixa — try/catch que vira log de servidor |
| `abrirSessao / tocarSessao / encerrarSessao` | `ids, empresa` | `sessão criada/atualizada/fechada` | Baixa |
| `situacaoSessao(sessaoId)` | `id` | ``{aberta, motivo}`, com cache de 10s` | Média |
| `encerrarSessoes(filtro, motivo)` | `usuarioId + `manter`/`sessaoId`` | `sessões fechadas + refresh tokens revogados` | Média — transação dupla (sessao + refreshToken) |
| `registrarUso(empresaId, usuarioId, caminho)` | `caminho da tela (web)` | ``{registrado}`` | Média — resolve rotina pela rota do menu (ver 3.1), upsert por dia |
| `usoPorRotina(empresaId, query)` | `filtros + período` | `ranking de rotinas (acessos, usuários distintos, último acesso)` | Média — agregação em memória |
| `desconectar(empresaId, ator, sessaoId)` | `id da sessão` | ``{success, jaEncerrada}`` | Média — recusa a própria sessão do ator |
| `encerrarSessoesDoUsuario(usuarioId, motivo)` | `id, motivo` | `todas as sessões abertas fechadas` | Baixa — usado no corte por fim de expediente |
| `listarEventos / listarSessoes` | `filtros + paginação` | `listas paginadas` | Média — `where` monta o corte de tenant (ver 3.2) |
| `resumo(empresaId, user, query)` | `filtros + período` | `cartões + tempo de uso por usuário` | Alta — agregação dupla (sessões + eventos de falha) em memória, ver 3.4 |
| `HorarioTrabalhoService.verificar(usuarioId, empresaId?, agora?)` | `ids, instante` | ``{dentro, motivo}`` | Média — cache de 1 min + feriado do dia |

## Fluxo Principal

### 1. 3.1 Resolução de rota → rotina (`rotinasPorRota`, `registrarUso`)

O catálogo rota→rotina é lido do `Menu` (`rota`) e cacheado em memória por 5 minutos
(muda só quando o catálogo é resincronizado). Quando um `Menu` tem mais de uma `Rotina`
associada (ex.: "Empresas" + "Base de Demonstração"), a rotina "principal" é escolhida
por prioridade: (1) rotina de mesmo nome do menu; (2) rotina cujo `codigo` aparece como
segmento da rota; (3) a primeira da lista. As rotas são ordenadas por tamanho
decrescente antes da busca, para que um prefixo mais específico
(`/comercial/produtos/fichas`) vença um mais genérico (`/comercial/produtos`).
`registrarUso` ignora silenciosamente caminho que não bate com nenhuma rota — é medição,
não pode derrubar a navegação.

### 2. 3.2 Isolamento sem RLS via filtro em código (`usuariosDaEmpresa`, `whereEventos`, `whereSessoes`)

`AcessoLog` e `Sessao` não têm RLS por tenant — são escritos no login, antes de existir
empresa ativa (comentário explícito no schema). O isolamento por empresa é inteiramente
em código: toda consulta restringe a `usuarioId IN (vínculos ativos da empresa)`. Exceção
documentada: tentativa de login com e-mail que não existe no cadastro (`usuarioId` nulo)
não pertence a empresa nenhuma e só aparece para quem tem `isAdmin` (perfil de sistema)
— sem essa trava, o admin da empresa A leria tentativas de e-mail contra a empresa B.

### 3. 3.3 Sessão "viva" sem fechamento explícito (`sessaoAtiva`, `MINUTOS_SESSAO_VIVA`)

Uma sessão sem `encerradaEm` só conta como ativa se `ultimaAtividadeEm` estiver a menos
de 40 minutos do agora. O valor é o dobro do ciclo de refresh (~15 min, com folga) —
navegador fechado sem logout explícito não renova o token e "envelhece" sozinho até sair
da janela, em vez de aparecer como ativo para sempre.

### 4. 3.4 Agregação dupla sessões+eventos em memória (`resumo`)

Constrói um mapa por `usuarioId` em duas passadas: primeiro todas as sessões do período
(sessões, minutos totais, último acesso), depois os eventos de falha do período —
usuário que só tentou e nunca entrou não tem sessão, então nasce no mapa já na segunda
passada, zerado. `usuariosDistintos` é contado **antes** da segunda passada de propósito
(comentário no código) — só conta quem efetivamente acessou, não quem só tentou. O
agregado roda em memória (não em SQL) porque a duração de cada sessão depende de
`encerradaEm ?? ultimaAtividadeEm`, calculada em JS, e o volume mensal por empresa é
pequeno.

### 5. 3.5 Cache de 1 minuto + feriado do dia (`HorarioTrabalhoService.verificar`)

Roda em toda requisição autenticada (via guard), então o TTL de 1 min equilibra custo
(uma consulta extra por request seria caro) com responsividade (quem edita o horário
chama `invalidar()` para valer na hora — ver `usuarios.salvarHorarios`). O feriado do dia
só é consultado (outro cache, 10 min) quando `restringirHorario` está ligado, e falha ao
lê-lo vira log + `null`, nunca 500 — login não pode cair por causa do feriado. A
comparação de horário é textual (`"08:00" <= hora < "18:00"`), válida porque o formato é
sempre `HH:MM` de largura fixa; faixa que atravessa meia-noite não é suportada (recusada
no cadastro).

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/horario/horario-trabalho.ts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/sessao/sessao-encerrada.exception.ts`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/acessos` | 🟢 |

## Estado Interno e Entidades

- **`Sessao`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`AcessoLog`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`UsoRotina`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`UsuarioHorario`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

