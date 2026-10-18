# backup-empresa — Design Técnico

> Especificação de design técnico e arquitetura interna do módulo `backup-empresa`.
> Escala de confiança: 🟢 CONFIRMADO (código) · 🟡 INFERIDO (arquitetura) · 🔴 LACUNA (requer validação)

## Interface

### Operações / Endpoints Principais

| Método / Símbolo | Entrada | Saída | Status / Observação |
|------------------|---------|-------|---------------------|
| `Rota` | `Comportamento` | `Result` | 200 OK |
| `GET /` | `todas as empresas (inclusive excluídas) com seus backups` | `Result` | 200 OK |
| `GET /config, PATCH /config` | ``ativo`, `frequenciaDias` (1–90), `manter` (1–52)` | `Result` | 200 OK |
| `POST /:empresaId` | `gera agora (202, em segundo plano)` | `Result` | 200 OK |
| `GET /:empresaId/:id/link` | `link de download de 5 min` | `Result` | 200 OK |
| `DELETE /:empresaId/:id` | `apaga o pacote e o registro` | `Result` | 200 OK |
| `Rota` | `Permissão` | `Result` | 200 OK |
| `GET /backups` | ``backups.visualizar`` | `Result` | 200 OK |
| `POST /backups (202)` | ``backups.exportar`` | `Result` | 200 OK |
| `GET /backups/:id/link` | ``backups.exportar`` | `Result` | 200 OK |
| `DELETE /backups/:id` | ``backups.excluir`` | `Result` | 200 OK |

## Fluxo Principal

### 1. 3.1 Catálogo — o que entra (`backup-catalogo.ts`)

- **Regra:** todo model do Prisma com `empresaId` entra, lido do DMMF
  (`Prisma.dmmf.datamodel.models`), exceto os listados em `FORA` com o motivo
  (catálogo global, perfis, termos, referência pública como município/CEP/CNAE, sessões,
  histórico de senha, links de redefinição e os próprios backups).
- **Especiais** (sem `empresaId`): a linha da `Empresa`, o `GrupoEconomico` dela e os
  `Usuario` com vínculo em `usuario_empresas`.
- **Campos mascarados** (vão `null`): hashes de senha, hash de chave de API, chaves e
  tokens cifrados do agente e do WhatsApp. **Parâmetros secretos**: `SMTP_SENHA` e
  `SMS_TOKEN` saem com `conteudo = null`.
- **Arquivos por nome**: `ProdutoFicha.arquivo` (`fichas/`),
  `ProdutoFichaImportacao.arquivo` (`fichas-importacao/`), `AgenteAnexo.arquivo`
  (`agente/`); os demais campos guardam `/uploads/...` inteiro e são achados em qualquer
  texto.
- **Testes de cobertura** garantem que um model novo não some sem decisão: todo model
  está em exatamente uma lista, e todo campo de texto que casa
  `/senha|hash|token|secret|segredo|cifrad|apikey|password/i` está mascarado ou liberado
  explicitamente (`NAO_SAO_SEGREDO`).

### 2. 3.2 Geração do pacote — `BackupGerador.gerar`

1. Zip em `uploads/.tmp/backup-<id>/pacote.zip` (no volume; o `main.ts` dá 404 para
   `/uploads/.tmp/`), `archiver` com zlib nível 6.
2. Exporta cada tabela da empresa, com **`UsuarioEmpresa` primeiro** (é dela que saem os
   usuários). Leitura **em páginas de 1000 por `skip/take`**, ordenada pela chave
   primária, cada página num `withTenant(empresaId)` **e** com `where empresaId` em
   código (cobre as tabelas com `empresaId` sem RLS). Cada linha vai para
   `dados/<tabela>.jsonl` e `planilhas/<tabela>.csv` (BOM, separador `;`), escritos em
   stream com respeito a `drain`.
3. Depois, `Empresa` (por id), `GrupoEconomico` (pelo `grupoEconomicoId` da empresa) e
   `Usuario` (ids coletados).
4. **`conferirDono`** — última barreira: um registro de outra empresa (ou usuário sem
   vínculo, ou grupo diferente) **derruba o backup inteiro** em vez de entrar no pacote.
5. **`observar`** coleta as chaves de arquivo; **`juntarArquivos`** põe cada uma no zip,
   uma por vez (espera o evento `entry`): do disco em stream; do S3 lido inteiro. Os que
   não existem vão para `arquivosAusentes` no manifesto.
6. `manifesto.json` (formato 1, empresa, data, origem, `versaoSchema` = última migration
   aplicada, contagem por tabela, arquivos, ausentes, o que foi mascarado, especiais e
   fora) e `LEIA-ME.txt`.

Serialização (`backup-serializar.ts`): data em ISO, `BigInt` e `Decimal` como texto (sem
perder precisão), bytes em base64; no CSV, aspas quando há `;`, `"` ou quebra de linha,
e campo JSON como JSON.

### 3. 3.3 Ciclo de vida — `BackupEmpresaService`

- **`solicitar`** (manual): `encerrarInterrompidos` (gerando há mais de **6 h** vira
  `falhou`) → cria `EmpresaBackup(gerando)`; o **índice único parcial**
  `empresa_backups_um_gerando` segura **um gerando por empresa** (P2002 → 409) → dispara
  `gerar` sem esperar e responde 202.
- **`gerar`**: gera, grava em `backups-empresas/<empresaId>/<iniciadoEm>-<origem>.zip`
  (`gravarArquivo`, stream para o S3), marca `pronto` com bytes/registros/arquivos; se
  agendado, poda. Em erro: `falhou` com a mensagem (até 2000 caracteres). Sempre apaga
  o temporário.
- **`link`**: só `pronto` com chave; `assinarCaminho('/uploads/<chave>', 300 s)`. O
  `main.ts` exige assinatura válida para `/uploads/backups-empresas/`.
- **`excluir`**: recusa `gerando` (409); apaga o arquivo e o registro.
- **`aoSubir`**: na subida da API, todo `gerando` de todas as empresas vira `falhou` e os
  temporários `backup-*` são apagados.

### 4. 3.4 Agendamento — `BackupEmpresaVarreduraService` + `agendados`

`setInterval` de **1 h** (primeira passagem 5 min depois do boot), flag `rodando` em
memória. Com a configuração ativa, para cada empresa **não excluída**: se o último
agendado `pronto` ou `gerando` começou há menos de `frequenciaDias`, pula; senão gera
**e espera** (uma empresa por vez). Falha numa empresa não para as outras.
**Poda** (`podarAgendados`, depois de cada agendado pronto): mantém os `manter` mais
recentes entre os agendados `pronto` **ou `falhou`** e apaga os demais (arquivo e
registro). Manuais nunca são podados.

### 5. 3.5 Achados

- ✅ **Corrigido em fb73c46** (só os prontos contam; falhas anteriores ao pronto saem). Achado original:
  🔴 **A poda conta os que falharam.** `podarAgendados` mantém os `manter` mais recentes
  entre `pronto` **e** `falhou`. Com `manter=4`, um pronto seguido de três falhas
  (gerados de hora em hora enquanto o problema persiste) apaga **todos os backups bons
  mais antigos**, ficando um só pronto. As falhas deveriam sair da conta ou ser podadas
  à parte.
- 🔴 **Não existe restauração.** O pacote e o manifesto foram desenhados para ela
  (`versaoSchema`, JSONL tipado), mas não há código que leia um pacote: o plano diz que
  a Fase 4 (restaurar, por script) "não começou". Hoje é exportação, não backup
  restaurável; as credenciais mascaradas também não voltariam.
- ✅ **Corrigido em 4c52520** (o link do MinIO vale só o que resta do `exp`). Achado original:
  🟡 **O link de 5 min vira 1 h no MinIO.** Com `backups-empresas` em
  `ARMAZENAMENTO_S3_PASTAS` (padrão no `docker-compose.dev.yml`, recomendado pelo plano
  para a produção), o `main.ts` confere a assinatura de 5 min e redireciona
  para o link pré-assinado do S3, que vale **1 h** (`VALIDADE_LINK_SEGUNDOS` do
  armazenamento). Quem tiver esse segundo link baixa a empresa inteira durante a hora.
- 🟡 **O pacote não é cifrado.** A empresa inteira (clientes, títulos, conversas de
  WhatsApp, usuários) fica num zip aberto no disco/MinIO e no computador de quem baixa.
- 🟡 **Não é um retrato consistente.** Cada página é uma transação separada e as tabelas
  são lidas em sequência; com a empresa operando, o pacote mistura momentos (um item de
  orçamento sem o cabeçalho, por exemplo).
- 🟡 **Paginação por `skip`** fica quadrática nas tabelas grandes
  (`whatsapp_mensagens`, notas): cada página relê as anteriores.
- 🟡 **Pacote órfão no armazenamento.** Se `gravarArquivo` dá certo e o `update` para
  `pronto` falha, o catch marca `falhou` sem `chave`; o zip fica no armazenamento sem
  registro que o aponte. O mesmo na poda, que engole a falha de `apagar`.
- 🟡 **`aoSubir` marca como falhou o que outra instância está gerando.** Com duas
  instâncias da API, reiniciar uma derruba o registro do backup que a outra gera (que
  depois sobrescreve com `pronto`). A flag `rodando` também é só em memória.
- 🟡 **`versaoSchema` pode sair "desconhecida".** Lê `_prisma_migrations` com o papel
  da aplicação (`plataforma_app`); sem permissão de leitura, o `catch` devolve
  `'desconhecida'` em silêncio, e a restauração futura não teria como conferir.
- 🟡 **Manuais acumulam sem limite** (só saem por exclusão).
- 🟡 **`solicitar` é *fire-and-forget*.** Se o `update` dentro do `catch` de `gerar`
  falhar, a rejeição fica sem tratamento, e o registro só sai de `gerando` em 6 h ou na
  próxima subida.
- 🟡 **O administrador da empresa baixa os dados de todos** os usuários e conversas da
  empresa com `backups.exportar`; é decisão de 2026-10-13, mas faz dessa permissão uma
  das mais sensíveis do catálogo.

## Fluxos Alternativos e de Exceção

- **Registro Inexistente ou Fora do Tenant:** Responde com 404 Not Found sem expor metadados internos de outras empresas. 🟢
- **Violação de Integridade ou Validação:** Erros de validação Zod retornam HTTP 400 BadRequestException com lista detalhada de campos. 🟢
- **Conflito de Concorrência:** Modificações simultâneas que violem regras de estado retornam HTTP 409 ConflictException. 🟢

## Dependências

- **`PrismaService`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/armazenamento`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/uploads/link-assinado`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`common/uploads/uploads.config`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`archiver`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢
- **`Prisma DMMF`:** Utilizado para suporte operacional, persistência ou regras de negócio integradas. 🟢

## Decisões de Design Identificadas

| Decisão | Evidência no Código | Confiança |
|---------|---------------------|-----------|
| **Isolamento via RLS Postgres:** Uso de `current_setting('app.current_empresa_id')` | `common/prisma` e migrations | 🟢 |
| **Contratos Estritos Zod:** Validação e tipagem forte via `@plataforma/contracts` | `apps/api/src/modules/backup-empresa` | 🟢 |

## Estado Interno e Entidades

- **`EmpresaBackup`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢
- **`BackupEmpresaConfig`:** Tabela gerenciada no Postgres com isolamento por `empresaId` e controle transacional. 🟢

## Observabilidade

- Erros e exceções capturados globalmente pelo `AllExceptionsFilter` e registrados no módulo de erros. 🟢
- Eventos de auditoria e logs gravados conforme criticidade da operação. 🟢

## Riscos e Lacunas

- 🟢 Operações principais e estruturas de dados 100% confirmadas no código legado.
- 🟡 Consultas complexas em grandes volumes de dados dependem de índices adequados nas colunas de filtro.

