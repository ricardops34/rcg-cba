# BJ.Integrador — Prompts para VS Code

Sequência de prompts para construir o serviço Windows que substitui a integração REST feita em AdvPL no Protheus.
Funciona com GitHub Copilot (modo Agent) ou Claude Code.

## Como usar

1. Crie o arquivo de instruções do **Prompt 0** na raiz do repositório:
   - Copilot: `.github/copilot-instructions.md`
   - Claude Code: `CLAUDE.md`
2. Execute os prompts **1 a 8, um de cada vez**, na ordem.
3. Ao final de cada etapa, revise, teste e só então envie o próximo prompt.
4. Antes do Prompt 5, copie os fontes de `C:\VPS\rcg\docs\integracao\advpl` para
   `C:\VPS\rcg\docs\integracao\windows\referencia-advpl` e remova da **cópia** tokens, senhas e URLs sensíveis.
   A pasta original não é alterada. Comando sugerido (PowerShell):

   ```powershell
   Copy-Item "C:\VPS\rcg\docs\integracao\advpl\*" "C:\VPS\rcg\docs\integracao\windows\referencia-advpl\" -Recurse -Force
   ```
5. Revise o `docs/MAPEAMENTO.md` gerado no Prompt 5 antes de executar as etapas 6 e 7.

## Premissas

- Um Protheus com várias empresas (SZZ010, SZZ020...), cada empresa correspondendo a um tenant no sistema destino.
  Uma connection string por empresa é opcional, para cobrir bancos Protheus separados.
- **Nenhum objeto é criado no banco do Protheus.** Toda estrutura própria fica no banco `BJ_INTEGRADOR`.
- O banco `BJ_INTEGRADOR` pode ser criado na mesma instância SQL Server (confirmar com o DBA).
  Se não for permitido, será necessário adaptar a etapa 2 e 4 para SQLite local.

---

## Prompt 0 — Instruções do projeto

> Salvar como `.github/copilot-instructions.md` ou `CLAUDE.md`.

```markdown
# Projeto: BJ.Integrador

Serviço Windows em .NET 10 (C#) que substitui a integração hoje feita em AdvPL no Protheus.
Coleta registros das tabelas de fila do Protheus (SZZ/SZY) no SQL Server, envia e recebe dados
de um sistema multi-tenant via API REST, e grava o status de volta nas tabelas.
Deve funcionar mesmo com o Protheus (AppServer) fora do ar.

## Ambiente
- Windows Server 2016, SQL Server
- Publicação self-contained win-x64, rodando como Serviço Windows

## Diretório do projeto
- Raiz dos fontes: C:\VPS\rcg\docs\integracao\windows
- Todos os arquivos (solution, projetos, /sql, /docs, /referencia-advpl) ficam dentro dessa pasta.
- Fontes AdvPL originais: C:\VPS\rcg\docs\integracao\advpl — SOMENTE LEITURA, nunca alterar.
  Trabalhar sempre sobre a cópia higienizada em referencia-advpl.
- Os fontes .prw/.tlpp costumam estar em ANSI (Windows-1252); ler com essa codificação para não corromper acentos.
- Scripts PowerShell (.ps1) devem ser salvos em UTF-8 com BOM (exigência do PowerShell 5.1 para acentos no conteúdo).
- Em comandos de terminal, sempre usar o caminho entre aspas.

## Stack obrigatória
- Worker Service + UseWindowsService()
- Hangfire (storage SQL Server, schema [hangfire]) para agendamento, fila e dashboard
- Dapper para acesso a dados (sem Entity Framework)
- Microsoft.Extensions.Http.Resilience para retry/circuit breaker no HttpClient
- Serilog (arquivo + console)
- System.Text.Json

## Bancos de dados
- BJ_INTEGRADOR (banco próprio do serviço): schemas [integ] e [hangfire].
- Banco do Protheus: somente leitura e atualização das tabelas de fila existentes (SZZ/SZY).
- Duas connection strings: Config (BJ_INTEGRADOR) e Protheus (padrão, sobreponível por empresa
  em integ.Empresa.ConnectionStringProtheus).

## Regras de arquitetura
- .
  No banco do Protheus o serviço apenas faz SELECT, UPDATE e (no recebimento) INSERT nas tabelas de fila existentes.
- PROIBIDO alterar a estrutura da SZZ/SZY. Controles adicionais do serviço ficam em integ.Controle.
- Nenhum nome de tabela, endpoint, credencial ou parâmetro de negócio fica no código.
  Tudo vem das tabelas do schema [integ] (Empresa, Fluxo, Parametro).
- appsettings.json contém apenas connection strings, porta e credenciais de acesso ao dashboard.
- Nomes de tabela dinâmicos: validar existência em sys.tables e usar QUOTENAME(). Nunca concatenar texto livre.
- Todo SQL com parâmetros (@param). Respeitar D_E_L_E_T_ = ' ' nas tabelas do Protheus.
- Credenciais de API criptografadas com ASP.NET Data Protection (ProtectKeysWithDpapi, escopo máquina).
- Credenciais nunca aparecem em logs.
- Isolamento por tenant: falha em uma empresa/fluxo não afeta os demais.
- Um mesmo fluxo de uma mesma empresa nunca executa em paralelo consigo mesmo.
- O comportamento (payload, status, regras) deve reproduzir fielmente os fontes AdvPL de referência.

## Forma de trabalho
- Execute somente a etapa pedida no prompt atual.
- Ao final de cada etapa: liste arquivos criados/alterados, explique como testar,
  e PARE aguardando minha confirmação. Não avance para a próxima etapa por conta própria.
- Em caso de dúvida sobre regra de negócio, pergunte em vez de supor.
- Nomes de domínio em português (Empresa, Fluxo, Parametro); termos técnicos em inglês são aceitáveis.
```

---

## Prompt 1 — Esqueleto do projeto

```
Etapa 1 — Esqueleto.

Crie a solution BJ.Integrador diretamente em "C:\VPS\rcg\docs\integracao\windows"
(o arquivo BJ.Integrador.sln deve ficar na raiz dessa pasta), com:
- Projeto Worker Service .NET 10 "BJ.Integrador.Service", configurado com UseWindowsService()
  e nome de serviço "BJ.Integrador".
- Kestrel embutido escutando na porta definida em appsettings (padrão 5080), com endpoint GET /health.
- Serilog gravando em arquivo rotativo diário na pasta "logs" ao lado do executável e no console.
- appsettings.json com: ConnectionStrings:Config, ConnectionStrings:Protheus, Dashboard:Porta,
  Dashboard:Usuario, Dashboard:Senha.
- Estrutura de pastas: Config/, Dados/, Jobs/, Integracao/, Seguranca/.
- Projeto de testes "BJ.Integrador.Tests" (xUnit).

Ainda sem Hangfire e sem lógica de negócio. Deve rodar com "dotnet run" e responder no /health.
```

---

## Prompt 2 — Banco próprio e configuração multi-tenant

```
Etapa 2 — Configuração multi-tenant.

Crie scripts SQL versionados em /sql (001_criar_banco.sql, 002_schema_integ.sql, 003_seed_exemplo.sql)
para o banco BJ_INTEGRADOR. NUNCA gere script para o banco do Protheus.

Schema [integ]:

integ.Empresa
  EmpresaId (char 2, PK), Nome, TenantId, BaseUrl, AuthTipo (Bearer|Basic|ApiKey|OAuth2),
  CredencialCriptografada (nvarchar(max)), ConnectionStringProtheus (nullable — se nulo, usa a conexão padrão),
  Ativo, DataAlteracao.

integ.Fluxo
  FluxoId (varchar 50) + EmpresaId (FK) — PK composta;
  Direcao (ENVIO|RECEBIMENTO), TabelaFila, TabelaRetorno (nullable), Endpoint, Metodo, Cron,
  TamanhoLote, TimeoutSeg, MaxRetentativas, Ativo, DataAlteracao.

integ.Parametro
  Id (identity), EmpresaId, FluxoId (nullable), Chave, Valor — unique em (EmpresaId, FluxoId, Chave).

integ.Controle
  EmpresaId, Tabela, Recno — PK composta;
  Status, Tentativas, InicioProcessamento, UltimoErro, JobId, DataAlteracao.
  Controle do serviço sem alterar a estrutura da SZZ/SZY.

integ.Log
  Id (identity), EmpresaId, FluxoId, Tabela, Recno, Direcao, Url, Metodo, PayloadEnviado, RespostaRecebida,
  HttpStatus, DuracaoMs, Sucesso, MensagemErro, DataHora. Índice por (EmpresaId, FluxoId, DataHora).

No C#:
- Modelos em Config/.
- Repositório Dapper para ler empresas, fluxos ativos e parâmetros
  (parâmetro de fluxo sobrepõe o parâmetro da empresa).
- FabricaConexao que devolve a conexão do Protheus de cada empresa (própria ou padrão).
- ValidadorTabela: confirma a existência da tabela em sys.tables no banco do Protheus da empresa
  e devolve o nome já com QUOTENAME. Cachear o resultado.
- Seed com uma empresa e um fluxo de exemplo para teste.
```

---

## Prompt 3 — Segurança das credenciais

```
Etapa 3 — Segurança das credenciais.

- Configure ASP.NET Data Protection com chaves persistidas na pasta local "keys"
  e ProtectKeysWithDpapi(protectToLocalMachine: true).
- Crie CofreCredenciais com Proteger(texto) e Revelar(textoCriptografado).
- Crie um comando de linha: "BJ.Integrador.Service.exe --proteger <texto>" que imprime o valor
  criptografado, para eu gravar em integ.Empresa.CredencialCriptografada.
- Garanta que credenciais e headers de autenticação nunca apareçam em logs nem em integ.Log.
- Documente em docs/CREDENCIAIS.md: a pasta "keys" precisa de backup; sem ela as credenciais não são recuperáveis.
```

---

## Prompt 4 — Hangfire, agendamento e monitor

```
Etapa 4 — Hangfire.

- Hangfire com SqlServerStorage no schema [hangfire] do banco BJ_INTEGRADOR (connection string Config).
- Dashboard em /monitor, com filtro de autorização Basic Auth (usuário/senha do appsettings),
  porque o dashboard padrão só aceita acesso local.
- Job SincronizadorFluxos a cada 2 minutos: lê integ.Fluxo ativos e cria/atualiza/remove
  RecurringJobs com id "{EmpresaId}:{FluxoId}" e o cron configurado. Fluxos ou empresas desativados são removidos.
- Job genérico ExecutarFluxo(empresaId, fluxoId) com bloqueio de concorrência por empresa+fluxo
  (fluxos e empresas diferentes podem rodar em paralelo).
  Por enquanto ele só registra log "executando {empresa}:{fluxo}".
- Retentativas automáticas respeitando MaxRetentativas do fluxo.
- Disparo manual (por demanda) pelo botão "Trigger" do dashboard.
- Nomes legíveis dos jobs no dashboard mostrando empresa e fluxo.
```

---

## Prompt 5 — Análise dos fontes AdvPL (sem código)

> Antes: copie os fontes de `C:\VPS\rcg\docs\integracao\advpl` para `referencia-advpl/` e higienize a cópia.

```
Etapa 5 — Análise dos fontes AdvPL. NÃO escreva código C# nesta etapa.

Leia todos os arquivos em /referencia-advpl e gere docs/MAPEAMENTO.md contendo, por fluxo:

1. Nome do fonte/função e se é envio ou recebimento.
2. Query de coleta completa (filtros, joins, ordenação) e quais campos da SZZ/SZY controlam status.
3. Valores de status usados (pendente, processando, enviado, erro...) e em que momento mudam.
4. Estrutura exata do JSON enviado/recebido, com a origem de cada campo e formatações
   (datas, decimais, trims, maiúsculas, campos vazios).
5. Endpoint, método, headers e autenticação (sem valores sensíveis).
6. Critério de sucesso/erro da resposta e o que é gravado em cada caso.
7. Uso de RecLock, LockByName, semáforos ou flags de concorrência.
8. Parâmetros GetMV/SuperGetMV usados — sugerir cada um como Chave em integ.Parametro, com valor atual se visível.
9. Regras de negócio escondidas (ifs, exceções por filial ou empresa, tratamentos especiais).
10. Pontos ambíguos ou possíveis bugs no fonte original — liste como perguntas para mim.
11. Papel de cada tabela (SZZ e SZY) e campos de status existentes. Informe se o AdvPL já possui
    um estado equivalente a "processando" utilizável para reserva atômica, ou se a reserva
    precisará ser feita via integ.Controle. Não sugira criação de campos nem tabelas no Protheus.
12. Diferenças de comportamento entre empresas, se houver, e como mapeá-las em integ.Fluxo/integ.Parametro.

Ao final, proponha o conteúdo de integ.Fluxo e integ.Parametro para cada empresa encontrada.
```

---

## Prompt 6 — Envio

```
Etapa 6 — Implementar ENVIO conforme docs/MAPEAMENTO.md.

- Reserva do lote (TamanhoLote) conforme definido no MAPEAMENTO.md:
  a) via status existente na SZZ: UPDATE TOP(n) ... WITH (UPDLOCK, READPAST, ROWLOCK) com OUTPUT; ou
  b) via integ.Controle: registro único por (EmpresaId, Tabela, Recno), inserido de forma atômica.
  Em nenhum caso alterar estrutura do Protheus.
- Registros presos em "processando" por mais de X minutos (Chave "TimeoutProcessamentoMin" em integ.Parametro)
  voltam para pendente.
- Montagem do payload com classes tipadas e System.Text.Json, reproduzindo exatamente o formato do AdvPL.
- HttpClient por empresa (BaseUrl, autenticação, TimeoutSeg) com resiliência
  (retry exponencial + circuit breaker isolado por empresa).
- Gravar sucesso/erro nos mesmos campos de status usados pelo AdvPL, incluindo a mensagem de erro.
- Registrar cada chamada em integ.Log (sem credenciais).
- Plugar em ExecutarFluxo quando Direcao = ENVIO.
- Testes unitários da montagem do payload comparando com um JSON de exemplo gerado pelo AdvPL
  (pedirei o exemplo se não houver em /referencia-advpl).
```

---

## Prompt 7 — Recebimento

```
Etapa 7 — Implementar RECEBIMENTO conforme docs/MAPEAMENTO.md.

- Consumo do endpoint com paginação e controle de "último recebido" conforme o AdvPL
  (guardar o controle em integ.Parametro se o fonte usava GetMV para isso).
- Gravação na tabela de retorno configurada (tabela já existente no Protheus), respeitando:
  R_E_C_N_O_ (próximo valor obtido com lock adequado dentro de transação), D_E_L_E_T_ = ' ' e R_E_C_D_E_L_ = 0,
  preenchendo todos os campos da tabela (campos não usados com valor padrão: espaço para char, 0 para numérico).
- Idempotência: não duplicar registro se o mesmo item vier duas vezes.
- Confirmação ao sistema de origem (ACK), se o AdvPL fazia isso.
- Registrar cada chamada em integ.Log.
- Plugar em ExecutarFluxo quando Direcao = RECEBIMENTO.
```

---

## Prompt 8 — Publicação e instalação

```
Etapa 8 — Publicação.

- Perfil de publish self-contained win-x64, single-file, pasta de saída "publish".
- Script PowerShell instalar.ps1:
  copia o conteúdo de "publish" para a pasta de instalação (parâmetro, padrão C:\Servicos\BJ.Integrador —
  o serviço NÃO roda a partir da pasta de fontes), preservando as pastas "keys" e "logs" e o appsettings.json
  em atualizações; cria o serviço com sc.exe (início automático atrasado), configura recuperação
  (reiniciar após 1 min nas 3 primeiras falhas), cria regra de firewall para a porta do dashboard
  e aplica os scripts /sql pendentes SOMENTE no banco BJ_INTEGRADOR.
- Script desinstalar.ps1.
- Script sql/permissoes_protheus.sql PARA O DBA EXECUTAR (não aplicar automaticamente):
  cria login/usuário do serviço com permissões mínimas — SELECT e UPDATE nas tabelas de fila,
  INSERT apenas nas tabelas de recebimento. Sem db_owner e sem criação de objetos.
- docs/INSTALACAO.md com o passo a passo no Windows Server 2016, incluindo backup da pasta "keys"
  e como migrar um fluxo do AdvPL para o serviço (desativar o job AdvPL antes de ativar o fluxo no serviço).
```

---

## Checklist de migração por fluxo

- [ ] Fluxo mapeado e revisado no `docs/MAPEAMENTO.md`
- [ ] Empresa e fluxo cadastrados em `integ.Empresa` / `integ.Fluxo` (inicialmente `Ativo = 0`)
- [ ] Payload validado contra um JSON real gerado pelo AdvPL
- [ ] Job AdvPL daquele fluxo/empresa **desativado** no Schedule
- [ ] Fluxo ativado no serviço (`Ativo = 1`) e acompanhado no `/monitor`
- [ ] Plano de volta: desativar o fluxo no serviço e religar o job AdvPL (a fila é a mesma)
