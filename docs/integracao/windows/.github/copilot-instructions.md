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
- PROIBIDO criar tabelas, colunas, índices, views, procedures, triggers ou qualquer objeto no banco do Protheus.
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
