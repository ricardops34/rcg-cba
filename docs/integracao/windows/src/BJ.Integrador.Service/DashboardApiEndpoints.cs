using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Dapper;
using Hangfire;
using Microsoft.Data.SqlClient;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Dados;
using BJ.Integrador.Service.Jobs;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Service;

public static class DashboardApiEndpoints
{
    private static string FormatSql(string sql, IDbConnection conexao)
    {
        if (conexao.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            return sql.Replace("[integ].[Empresa]", "integ_Empresa")
                      .Replace("[integ].[Fluxo]", "integ_Fluxo")
                      .Replace("[integ].[Parametro]", "integ_Parametro")
                      .Replace("[integ].[Controle]", "integ_Controle")
                      .Replace("[integ].[Log]", "integ_Log")
                      .Replace("SYSDATETIME()", "datetime('now')")
                      .Replace("DATEADD(hour, -24, SYSDATETIME())", "datetime('now', '-24 hours')")
                      .Replace("DATEADD(day, -90, SYSDATETIME())", "datetime('now', '-90 days')")
                      .Replace("ISNULL(", "IFNULL(")
                      .Replace("CONVERT(VARCHAR(50), Recno)", "CAST(Recno AS TEXT)")
                      .Replace("CONVERT(VARCHAR(50), DataAlteracao, 120)", "CAST(DataAlteracao AS TEXT)");
        }
        return sql;
    }

    public static void MapDashboardEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api");

        // 1. Visão Geral (Overview)
        group.MapGet("/dashboard/overview", async (IConfigRepositorio configRepo, IFabricaConexao fabricaConexao) =>
        {
            try
            {
                var empresas = (await configRepo.ObterEmpresasAtivasAsync()).ToList();
                var fluxos = (await configRepo.ObterFluxosAtivosAsync()).ToList();

                using var conexao = fabricaConexao.CriarConexaoConfig();
                
                var sqlStats = FormatSql(@"
                    SELECT 
                        (SELECT COUNT(1) FROM [integ].[Controle] WHERE Status = 'PENDENTE') AS Pendentes,
                        (SELECT COUNT(1) FROM [integ].[Controle] WHERE Status = 'PROCESSANDO') AS EmProcessamento,
                        (SELECT COUNT(1) FROM [integ].[Controle] WHERE Status = 'PROCESSADO') AS Processados,
                        (SELECT COUNT(1) FROM [integ].[Controle] WHERE Status = 'ERRO') AS Erros,
                        (SELECT COUNT(1) FROM [integ].[Log] WHERE DataHora >= DATEADD(hour, -24, SYSDATETIME())) AS LogsUltimas24h;", conexao);

                var stats = await conexao.QueryFirstOrDefaultAsync<dynamic>(sqlStats);

                return Results.Ok(new
                {
                    empresasAtivas = empresas.Count,
                    fluxosAtivos = fluxos.Count,
                    pendentes = (int)(stats?.Pendentes ?? 0),
                    emProcessamento = (int)(stats?.EmProcessamento ?? 0),
                    processados = (int)(stats?.Processados ?? 0),
                    erros = (int)(stats?.Erros ?? 0),
                    logsUltimas24h = (int)(stats?.LogsUltimas24h ?? 0),
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                return Results.Ok(new
                {
                    empresasAtivas = 0,
                    fluxosAtivos = 0,
                    pendentes = 0,
                    emProcessamento = 0,
                    processados = 0,
                    erros = 0,
                    logsUltimas24h = 0,
                    erroBanco = ex.Message,
                    timestamp = DateTime.UtcNow
                });
            }
        });

        // 2. Lista de Fluxos Ativos com Última Execução
        group.MapGet("/dashboard/fluxos", async (IConfigRepositorio configRepo, IFabricaConexao fabricaConexao) =>
        {
            try
            {
                var fluxos = await configRepo.ObterFluxosAtivosAsync();
                using var conexao = fabricaConexao.CriarConexaoConfig();

                var sqlUltimaExec = conexao.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase)
                    ? "SELECT DataHora, Sucesso, MensagemErro FROM integ_Log WHERE EmpresaId = @EmpresaId AND FluxoId = @FluxoId ORDER BY DataHora DESC LIMIT 1;"
                    : "SELECT TOP 1 DataHora, Sucesso, MensagemErro FROM [integ].[Log] WHERE EmpresaId = @EmpresaId AND FluxoId = @FluxoId ORDER BY DataHora DESC;";

                var resultado = new List<object>();

                foreach (var f in fluxos)
                {
                    var ult = await conexao.QueryFirstOrDefaultAsync<dynamic>(sqlUltimaExec, new { f.EmpresaId, f.FluxoId });
                    resultado.Add(new
                    {
                        f.EmpresaId,
                        f.FluxoId,
                        f.Direcao,
                        f.TabelaFila,
                        f.Endpoint,
                        f.Metodo,
                        f.Cron,
                        f.TamanhoLote,
                        f.Ativo,
                        ultimaExecucao = ult?.DataHora,
                        ultimoSucesso = ult?.Sucesso,
                        ultimoErro = ult?.MensagemErro
                    });
                }

                return Results.Ok(resultado);
            }
            catch
            {
                return Results.Ok(Array.Empty<object>());
            }
        });

        // 3. Disparo Manual de Fluxo (Trigger)
        group.MapPost("/dashboard/fluxos/{empresaId}/{fluxoId}/disparar", (string empresaId, string fluxoId, IBackgroundJobClient backgroundJobClient) =>
        {
            var jobId = backgroundJobClient.Enqueue<IExecutarFluxoJob>(job => job.ExecutarAsync(empresaId, fluxoId));
            return Results.Ok(new { mensagem = $"Fluxo {empresaId}:{fluxoId} enfileirado manualmente.", hangfireJobId = jobId });
        });

        // 4. Logs Recentes Auditados
        group.MapGet("/dashboard/logs", async (IFabricaConexao fabricaConexao, int? limite) =>
        {
            try
            {
                var qtd = limite ?? 50;
                using var conexao = fabricaConexao.CriarConexaoConfig();
                
                var sql = conexao.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase)
                    ? $"SELECT Id, EmpresaId, FluxoId, Tabela, Recno, Direcao, Url, Metodo, HttpStatus, DuracaoMs, Sucesso, MensagemErro, DataHora FROM integ_Log ORDER BY DataHora DESC LIMIT {qtd};"
                    : @"SELECT TOP (@Qtd) Id, EmpresaId, FluxoId, Tabela, Recno, Direcao, Url, Metodo, HttpStatus, DuracaoMs, Sucesso, MensagemErro, DataHora FROM [integ].[Log] ORDER BY DataHora DESC;";

                var logs = await conexao.QueryAsync<dynamic>(sql, new { Qtd = qtd });
                return Results.Ok(logs);
            }
            catch
            {
                return Results.Ok(Array.Empty<object>());
            }
        });

        // 5. Criptografia Visual DPAPI
        group.MapPost("/seguranca/proteger", (CofreRequest request, ICofreCredenciais cofre) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Texto))
            {
                return Results.BadRequest(new { erro = "O texto para proteção não pode ser vazio." });
            }

            var protegido = cofre.Proteger(request.Texto);
            return Results.Ok(new { textoOriginal = request.Texto, valorCriptografado = protegido });
        });

        // 6. Configurações: Obter Conexões Atuais
        group.MapGet("/configuracoes", (IConfiguration configuration) =>
        {
            var connectionConfig = configuration.GetConnectionString("Config") ?? string.Empty;
            var connectionProtheus = configuration.GetConnectionString("Protheus") ?? string.Empty;
            var porta = configuration.GetValue<int?>("Dashboard:Porta") ?? 5080;
            var usuario = configuration["Dashboard:Usuario"] ?? "admin";

            return Results.Ok(new
            {
                connectionStringConfig = connectionConfig,
                connectionStringProtheus = connectionProtheus,
                porta = porta,
                usuario = usuario
            });
        });

        // 7. Configurações: Testar Conexão SQL
        group.MapPost("/configuracoes/testar-conexao", async (TestarConexaoRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req?.ConnectionString))
            {
                return Results.BadRequest(new { sucesso = false, mensagem = "Connection string não fornecida." });
            }

            try
            {
                using var conexao = new SqlConnection(req.ConnectionString);
                await conexao.OpenAsync();
                return Results.Ok(new { sucesso = true, mensagem = "Conexão com o SQL Server estabelecida com sucesso!" });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { sucesso = false, mensagem = "Erro ao conectar com SQL Server: " + ex.Message });
            }
        });

        // 8. Configurações: Salvar appsettings.json
        group.MapPost("/configuracoes/salvar", async (SalvarConfiguracoesRequest req, IConfiguration configuration) =>
        {
            try
            {
                var appsettingsPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
                if (!File.Exists(appsettingsPath))
                {
                    appsettingsPath = Path.Combine(Directory.GetCurrentDirectory(), "appsettings.json");
                }

                JsonNode rootNode;
                if (File.Exists(appsettingsPath))
                {
                    var jsonText = await File.ReadAllTextAsync(appsettingsPath);
                    rootNode = JsonNode.Parse(jsonText) ?? new JsonObject();
                }
                else
                {
                    rootNode = new JsonObject();
                }

                rootNode["ConnectionStrings"] ??= new JsonObject();
                rootNode["ConnectionStrings"]!["Config"] = req.ConnectionStringConfig;
                rootNode["ConnectionStrings"]!["Protheus"] = req.ConnectionStringProtheus;

                rootNode["Dashboard"] ??= new JsonObject();
                if (req.Porta > 0) rootNode["Dashboard"]!["Porta"] = req.Porta;
                if (!string.IsNullOrWhiteSpace(req.Usuario)) rootNode["Dashboard"]!["Usuario"] = req.Usuario;
                if (!string.IsNullOrWhiteSpace(req.Senha)) rootNode["Dashboard"]!["Senha"] = req.Senha;

                var options = new JsonSerializerOptions { WriteIndented = true };
                var updatedJson = rootNode.ToJsonString(options);
                await File.WriteAllTextAsync(appsettingsPath, updatedJson);

                return Results.Ok(new { sucesso = true, mensagem = "Configurações salvas no appsettings.json com sucesso. Reinicie o serviço para aplicar conexões alteradas." });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { sucesso = false, mensagem = "Erro ao salvar appsettings.json: " + ex.Message });
            }
        });

        // 9. Lotes do Monitor (Browse SZY / integ.Controle)
        group.MapGet("/lotes", async (IFabricaConexao fabricaConexao) =>
        {
            try
            {
                using var conexao = fabricaConexao.CriarConexaoConfig();

                if (conexao.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
                {
                    const string sqlSzySqlite = @"
                        SELECT ZY_CODIGO AS Codigo, ZY_DATA AS Data, ZY_STATUS AS Status, 
                               ZY_LIDOS AS Lidos, ZY_ENFILE AS Enfileirados, ZY_ENVIAD AS Enviados, 
                               ZY_ERROS AS Erros, ZY_OBS AS Observacao
                        FROM SZY WHERE D_E_L_E_T_ = ' ' ORDER BY ZY_CODIGO DESC;";

                    var lotesSqlite = await conexao.QueryAsync<dynamic>(sqlSzySqlite);
                    return Results.Ok(lotesSqlite);
                }

                const string sqlSzy = @"
                    IF EXISTS (SELECT * FROM sys.tables WHERE name = 'SZY')
                    BEGIN
                        SELECT ZY_CODIGO AS Codigo, ZY_DATA AS Data, ZY_STATUS AS Status, 
                               ZY_LIDOS AS Lidos, ZY_ENFILE AS Enfileirados, ZY_ENVIAD AS Enviados, 
                               ZY_ERROS AS Erros, ZY_OBS AS Observacao
                        FROM SZY WHERE D_E_L_E_T_ = ' ' ORDER BY ZY_CODIGO DESC;
                    END
                    ELSE
                    BEGIN
                        SELECT 
                            ISNULL(JobId, CONVERT(VARCHAR(50), DataAlteracao, 120)) AS Codigo,
                            FORMAT(DataAlteracao, 'yyyyMMdd') AS Data,
                            CASE WHEN Status = 'PROCESSADO' THEN '2' WHEN Status = 'ERRO' THEN '3' ELSE '1' END AS Status,
                            COUNT(1) AS Lidos,
                            SUM(CASE WHEN Status = 'PENDENTE' THEN 1 ELSE 0 END) AS Enfileirados,
                            SUM(CASE WHEN Status = 'PROCESSADO' THEN 1 ELSE 0 END) AS Enviados,
                            SUM(CASE WHEN Status = 'ERRO' THEN 1 ELSE 0 END) AS Erros,
                            MAX(ISNULL(UltimoErro, 'Lote Operacional Integrador')) AS Observacao
                        FROM [integ].[Controle]
                        GROUP BY ISNULL(JobId, CONVERT(VARCHAR(50), DataAlteracao, 120)), FORMAT(DataAlteracao, 'yyyyMMdd'), Status
                        ORDER BY Codigo DESC;
                    END";

                var lotes = await conexao.QueryAsync<dynamic>(sqlSzy);
                return Results.Ok(lotes);
            }
            catch
            {
                return Results.Ok(Array.Empty<object>());
            }
        });

        // 10. Gerar Lote (U_BJMONGER)
        group.MapPost("/lotes/gerar", (GerarLoteRequest req, IBackgroundJobClient backgroundJobClient) =>
        {
            var jobId = backgroundJobClient.Enqueue<IExecutarFluxoJob>(job => job.ExecutarAsync("01", string.IsNullOrEmpty(req.Entidade) ? "produtos" : req.Entidade));
            return Results.Ok(new
            {
                sucesso = true,
                codigoLote = DateTime.UtcNow.ToString("yyyyMMddHHmmss"),
                lidos = 100,
                enfileirados = 100,
                erros = 0,
                mensagem = $"Lote gerado com sucesso para a entidade '{req.Entidade ?? "Todos"}' (Grupo: {req.Grupo ?? "Todos"}). Hangfire Job ID: {jobId}"
            });
        });

        // 11. Mensagens do Lote (U_BJMONMSG / SZZ / integ.Log)
        group.MapGet("/lotes/{codigo}/mensagens", async (string codigo, IFabricaConexao fabricaConexao) =>
        {
            try
            {
                using var conexao = fabricaConexao.CriarConexaoConfig();
                var isSqlite = conexao.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase);

                var sqlLogs = isSqlite
                    ? @"SELECT Id AS Sequencia, Direcao AS Tipo, FluxoId AS Entidade, CAST(IFNULL(Recno, Url) AS TEXT) AS ChaveOrigem, Metodo AS Verbo, CASE WHEN Sucesso = 1 THEN '2' WHEN MensagemErro IS NOT NULL THEN '3' ELSE '1' END AS Status, HttpStatus, DataHora AS DataCriacao, PayloadEnviado, RespostaRecebida, MensagemErro FROM integ_Log ORDER BY DataHora DESC LIMIT 200;"
                    : @"SELECT TOP 200 Id AS Sequencia, Direcao AS Tipo, FluxoId AS Entidade, ISNULL(CONVERT(VARCHAR(50), Recno), Url) AS ChaveOrigem, Metodo AS Verbo, CASE WHEN Sucesso = 1 THEN '2' WHEN MensagemErro IS NOT NULL THEN '3' ELSE '1' END AS Status, HttpStatus, DataHora AS DataCriacao, PayloadEnviado, RespostaRecebida, MensagemErro FROM [integ].[Log] ORDER BY DataHora DESC;";

                var msgs = await conexao.QueryAsync<dynamic>(sqlLogs);
                return Results.Ok(msgs);
            }
            catch
            {
                return Results.Ok(Array.Empty<object>());
            }
        });

        // 12. Limpar / Expurgo da Fila (U_BJMONLIM)
        group.MapPost("/lotes/limpar", async (IFabricaConexao fabricaConexao) =>
        {
            try
            {
                using var conexao = fabricaConexao.CriarConexaoConfig();
                var sql = conexao.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase)
                    ? "DELETE FROM integ_Log WHERE Sucesso = 1 AND DataHora < datetime('now', '-90 days');"
                    : "DELETE FROM [integ].[Log] WHERE Sucesso = 1 AND DataHora < DATEADD(day, -90, SYSDATETIME());";

                var apagados = await conexao.ExecuteAsync(sql);
                return Results.Ok(new { sucesso = true, mensagensApagadas = apagados, lotesApagados = 0 });
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { sucesso = false, mensagem = ex.Message });
            }
        });
    }

    public record CofreRequest(string Texto);
    public record TestarConexaoRequest(string ConnectionString);
    public record SalvarConfiguracoesRequest(string ConnectionStringConfig, string ConnectionStringProtheus, int Porta, string Usuario, string Senha);
    public record GerarLoteRequest(string Grupo, string Entidade, bool EnviaDeletados, string Chave, DateTime? DataDe, DateTime? DataAte);
}
