using System.Data;
using Dapper;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Service.Dados;

public interface IRecebimentoRepositorio
{
    Task<string?> ObterCursorRecebimentoAsync(string empresaId, string fluxoId);
    Task SalvarCursorRecebimentoAsync(string empresaId, string fluxoId, string novoCursor);
    Task<bool> RegistroJaProcessadoAsync(string empresaId, string tabela, string chaveOrigem);
    Task<long> InserirRegistroRetornoProtheusAsync(Empresa empresa, Fluxo fluxo, string chaveOrigem, IDictionary<string, object> camposProtheus);
    Task RegistrarLogAsync(string empresaId, string fluxoId, string tabela, string url, string metodo, string? payload, string? resposta, int status, long duracaoMs, bool sucesso, string? erro);
}

public class RecebimentoRepositorio : IRecebimentoRepositorio
{
    private readonly IFabricaConexao _fabricaConexao;
    private readonly IValidadorTabela _validadorTabela;
    private readonly IConfigRepositorio _configRepositorio;

    public RecebimentoRepositorio(
        IFabricaConexao fabricaConexao,
        IValidadorTabela validadorTabela,
        IConfigRepositorio configRepositorio)
    {
        _fabricaConexao = fabricaConexao ?? throw new ArgumentNullException(nameof(fabricaConexao));
        _validadorTabela = validadorTabela ?? throw new ArgumentNullException(nameof(validadorTabela));
        _configRepositorio = configRepositorio ?? throw new ArgumentNullException(nameof(configRepositorio));
    }

    public async Task<string?> ObterCursorRecebimentoAsync(string empresaId, string fluxoId)
    {
        return await _configRepositorio.ObterParametroValorAsync(empresaId, fluxoId, "UltimoCursorRecebimento");
    }

    public async Task SalvarCursorRecebimentoAsync(string empresaId, string fluxoId, string novoCursor)
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            MERGE INTO [integ].[Parametro] AS Target
            USING (SELECT @EmpresaId AS EmpresaId, @FluxoId AS FluxoId, 'UltimoCursorRecebimento' AS Chave) AS Source
            ON Target.EmpresaId = Source.EmpresaId AND ISNULL(Target.FluxoId, '') = ISNULL(Source.FluxoId, '') AND Target.Chave = Source.Chave
            WHEN MATCHED THEN
                UPDATE SET Valor = @NovoCursor
            WHEN NOT MATCHED THEN
                INSERT (EmpresaId, FluxoId, Chave, Valor)
                VALUES (@EmpresaId, @FluxoId, 'UltimoCursorRecebimento', @NovoCursor);";

        await conexao.ExecuteAsync(sql, new { EmpresaId = empresaId, FluxoId = fluxoId, NovoCursor = novoCursor });
    }

    public async Task<bool> RegistroJaProcessadoAsync(string empresaId, string tabela, string chaveOrigem)
    {
        using var conexao = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            SELECT COUNT(1) 
            FROM [integ].[Log] 
            WHERE EmpresaId = @EmpresaId AND Tabela = @Tabela AND PayloadEnviado LIKE '%' + @ChaveOrigem + '%' AND Sucesso = 1;";

        var count = await conexao.ExecuteScalarAsync<int>(sql, new
        {
            EmpresaId = empresaId,
            Tabela = tabela.Trim().ToUpperInvariant(),
            ChaveOrigem = chaveOrigem
        });

        return count > 0;
    }

    public async Task<long> InserirRegistroRetornoProtheusAsync(Empresa empresa, Fluxo fluxo, string chaveOrigem, IDictionary<string, object> camposProtheus)
    {
        var nomeTabelaRetorno = !string.IsNullOrWhiteSpace(fluxo.TabelaRetorno) ? fluxo.TabelaRetorno : fluxo.TabelaFila;
        var nomeTabelaEscapado = await _validadorTabela.ValidarEObterNomeTabelaAsync(empresa, nomeTabelaRetorno);

        using var conexaoProtheus = _fabricaConexao.CriarConexaoProtheus(empresa);

        if (conexaoProtheus.State != ConnectionState.Open)
        {
            conexaoProtheus.Open();
        }

        using var transaction = conexaoProtheus.BeginTransaction(IsolationLevel.Serializable);

        var sqlMaxRecno = $"SELECT ISNULL(MAX(R_E_C_N_O_), 0) + 1 FROM {nomeTabelaEscapado};";
        var novoRecno = await conexaoProtheus.ExecuteScalarAsync<long>(sqlMaxRecno, transaction: transaction);

        camposProtheus["R_E_C_N_O_"] = novoRecno;
        camposProtheus["D_E_L_E_T_"] = " ";
        camposProtheus["R_E_C_D_E_L_"] = 0;

        var colunas = string.Join(", ", camposProtheus.Keys);
        var parametros = string.Join(", ", camposProtheus.Keys.Select(k => "@" + k));

        var sqlInsert = $"INSERT INTO {nomeTabelaEscapado} ({colunas}) VALUES ({parametros});";

        var dynamicParams = new DynamicParameters();
        foreach (var kvp in camposProtheus)
        {
            dynamicParams.Add(kvp.Key, kvp.Value);
        }

        await conexaoProtheus.ExecuteAsync(sqlInsert, dynamicParams, transaction: transaction);
        transaction.Commit();

        using var conexaoConfig = _fabricaConexao.CriarConexaoConfig();
        const string sqlControle = @"
            INSERT INTO [integ].[Controle] (EmpresaId, Tabela, Recno, Status, Tentativas, InicioProcessamento, DataAlteracao)
            VALUES (@EmpresaId, @Tabela, @Recno, 'PROCESSADO', 1, SYSDATETIME(), SYSDATETIME());";

        await conexaoConfig.ExecuteAsync(sqlControle, new
        {
            EmpresaId = empresa.EmpresaId,
            Tabela = nomeTabelaRetorno.Trim().ToUpperInvariant(),
            Recno = novoRecno
        });

        return novoRecno;
    }

    public async Task RegistrarLogAsync(string empresaId, string fluxoId, string tabela, string url, string metodo, string? payload, string? resposta, int status, long duracaoMs, bool sucesso, string? erro)
    {
        using var conexaoConfig = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            INSERT INTO [integ].[Log] (
                EmpresaId, FluxoId, Tabela, Recno, Direcao, Url, Metodo, 
                PayloadEnviado, RespostaRecebida, HttpStatus, DuracaoMs, Sucesso, MensagemErro, DataHora
            )
            VALUES (
                @EmpresaId, @FluxoId, @Tabela, NULL, 'RECEBIMENTO', @Url, @Metodo, 
                @PayloadEnviado, @RespostaRecebida, @HttpStatus, @DuracaoMs, @Sucesso, @MensagemErro, SYSDATETIME()
            );";

        await conexaoConfig.ExecuteAsync(sql, new
        {
            EmpresaId = empresaId,
            FluxoId = fluxoId,
            Tabela = tabela.Trim().ToUpperInvariant(),
            Url = url,
            Metodo = metodo,
            PayloadEnviado = SanitizadorLogs.Sanitizar(payload),
            RespostaRecebida = SanitizadorLogs.Sanitizar(resposta),
            HttpStatus = status,
            DuracaoMs = duracaoMs,
            Sucesso = sucesso,
            MensagemErro = erro
        });
    }
}
