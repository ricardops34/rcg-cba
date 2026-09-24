using System.Data;
using Dapper;
using BJ.Integrador.Service.Config;

namespace BJ.Integrador.Service.Dados;

public interface IConfigRepositorio
{
    Task<IEnumerable<Empresa>> ObterEmpresasAtivasAsync();
    Task<Empresa?> ObterEmpresaPorIdAsync(string empresaId);
    Task<IEnumerable<Fluxo>> ObterFluxosAtivosAsync();
    Task<IEnumerable<Fluxo>> ObterFluxosAtivosPorEmpresaAsync(string empresaId);
    Task<Fluxo?> ObterFluxoAsync(string empresaId, string fluxoId);
    Task<IEnumerable<Parametro>> ObterParametrosPorEmpresaAsync(string empresaId);
    Task<string?> ObterParametroValorAsync(string empresaId, string? fluxoId, string chave);
    Task<Dictionary<string, string>> ObterParametrosCompiladosAsync(string empresaId, string? fluxoId);
}

public class ConfigRepositorio : IConfigRepositorio
{
    private readonly IFabricaConexao _fabricaConexao;

    public ConfigRepositorio(IFabricaConexao fabricaConexao)
    {
        _fabricaConexao = fabricaConexao ?? throw new ArgumentNullException(nameof(fabricaConexao));
    }

    private static string FormatSql(string sql, IDbConnection conexao)
    {
        if (conexao.GetType().Name.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            return sql.Replace("[integ].[Empresa]", "integ_Empresa")
                      .Replace("[integ].[Fluxo]", "integ_Fluxo")
                      .Replace("[integ].[Parametro]", "integ_Parametro")
                      .Replace("[integ].[Controle]", "integ_Controle")
                      .Replace("[integ].[Log]", "integ_Log")
                      .Replace("SYSDATETIME()", "datetime('now')");
        }
        return sql;
    }

    public async Task<IEnumerable<Empresa>> ObterEmpresasAtivasAsync()
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            SELECT EmpresaId, Nome, TenantId, BaseUrl, AuthTipo, CredencialCriptografada, 
                   ConnectionStringProtheus, Ativo, DataAlteracao
            FROM [integ].[Empresa]
            WHERE Ativo = 1;";

        return await conexao.QueryAsync<Empresa>(FormatSql(sql, conexao));
    }

    public async Task<Empresa?> ObterEmpresaPorIdAsync(string empresaId)
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            SELECT EmpresaId, Nome, TenantId, BaseUrl, AuthTipo, CredencialCriptografada, 
                   ConnectionStringProtheus, Ativo, DataAlteracao
            FROM [integ].[Empresa]
            WHERE EmpresaId = @EmpresaId;";

        return await conexao.QueryFirstOrDefaultAsync<Empresa>(FormatSql(sql, conexao), new { EmpresaId = empresaId });
    }

    public async Task<IEnumerable<Fluxo>> ObterFluxosAtivosAsync()
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            SELECT f.FluxoId, f.EmpresaId, f.Direcao, f.TabelaFila, f.TabelaRetorno, 
                   f.Endpoint, f.Metodo, f.Cron, f.TamanhoLote, f.TimeoutSeg, 
                   f.MaxRetentativas, f.Ativo, f.DataAlteracao
            FROM [integ].[Fluxo] f
            INNER JOIN [integ].[Empresa] e ON e.EmpresaId = f.EmpresaId
            WHERE f.Ativo = 1 AND e.Ativo = 1;";

        return await conexao.QueryAsync<Fluxo>(FormatSql(sql, conexao));
    }

    public async Task<IEnumerable<Fluxo>> ObterFluxosAtivosPorEmpresaAsync(string empresaId)
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            SELECT f.FluxoId, f.EmpresaId, f.Direcao, f.TabelaFila, f.TabelaRetorno, 
                   f.Endpoint, f.Metodo, f.Cron, f.TamanhoLote, f.TimeoutSeg, 
                   f.MaxRetentativas, f.Ativo, f.DataAlteracao
            FROM [integ].[Fluxo] f
            INNER JOIN [integ].[Empresa] e ON e.EmpresaId = f.EmpresaId
            WHERE f.EmpresaId = @EmpresaId AND f.Ativo = 1 AND e.Ativo = 1;";

        return await conexao.QueryAsync<Fluxo>(FormatSql(sql, conexao), new { EmpresaId = empresaId });
    }

    public async Task<Fluxo?> ObterFluxoAsync(string empresaId, string fluxoId)
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            SELECT FluxoId, EmpresaId, Direcao, TabelaFila, TabelaRetorno, 
                   Endpoint, Metodo, Cron, TamanhoLote, TimeoutSeg, 
                   MaxRetentativas, Ativo, DataAlteracao
            FROM [integ].[Fluxo]
            WHERE EmpresaId = @EmpresaId AND FluxoId = @FluxoId;";

        return await conexao.QueryFirstOrDefaultAsync<Fluxo>(FormatSql(sql, conexao), new { EmpresaId = empresaId, FluxoId = fluxoId });
    }

    public async Task<IEnumerable<Parametro>> ObterParametrosPorEmpresaAsync(string empresaId)
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            SELECT Id, EmpresaId, FluxoId, Chave, Valor
            FROM [integ].[Parametro]
            WHERE EmpresaId = @EmpresaId;";

        return await conexao.QueryAsync<Parametro>(FormatSql(sql, conexao), new { EmpresaId = empresaId });
    }

    public async Task<string?> ObterParametroValorAsync(string empresaId, string? fluxoId, string chave)
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();

        if (!string.IsNullOrWhiteSpace(fluxoId))
        {
            const string sqlFluxo = @"
                SELECT Valor
                FROM [integ].[Parametro]
                WHERE EmpresaId = @EmpresaId AND FluxoId = @FluxoId AND Chave = @Chave;";

            var valorFluxo = await conexao.QueryFirstOrDefaultAsync<string?>(FormatSql(sqlFluxo, conexao), new { EmpresaId = empresaId, FluxoId = fluxoId, Chave = chave });
            if (valorFluxo != null)
            {
                return valorFluxo;
            }
        }

        const string sqlEmpresa = @"
            SELECT Valor
            FROM [integ].[Parametro]
            WHERE EmpresaId = @EmpresaId AND FluxoId IS NULL AND Chave = @Chave;";

        return await conexao.QueryFirstOrDefaultAsync<string?>(FormatSql(sqlEmpresa, conexao), new { EmpresaId = empresaId, Chave = chave });
    }

    public async Task<Dictionary<string, string>> ObterParametrosCompiladosAsync(string empresaId, string? fluxoId)
    {
        var todosParametros = await ObterParametrosPorEmpresaAsync(empresaId);
        var resultado = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var p in todosParametros.Where(p => p.FluxoId == null && p.Valor != null))
        {
            resultado[p.Chave] = p.Valor!;
        }

        if (!string.IsNullOrWhiteSpace(fluxoId))
        {
            foreach (var p in todosParametros.Where(p => string.Equals(p.FluxoId, fluxoId, StringComparison.OrdinalIgnoreCase) && p.Valor != null))
            {
                resultado[p.Chave] = p.Valor!;
            }
        }

        return resultado;
    }
}
