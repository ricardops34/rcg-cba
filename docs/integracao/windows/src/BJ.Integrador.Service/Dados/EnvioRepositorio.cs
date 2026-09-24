using System.Data;
using Dapper;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Integracao;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Service.Dados;

public interface IEnvioRepositorio
{
    Task<int> LiberarRegistrosPresosTimeoutAsync(string empresaId, int timeoutMinutos);
    Task<IEnumerable<RegistroFilaSzz>> ReservarLoteEnvioAsync(Empresa empresa, Fluxo fluxo, int tamanhoLote, string jobId);
    Task AtualizarResultadoEnvioAsync(Empresa empresa, Fluxo fluxo, RegistroFilaSzz registro, int httpStatus, string respostaBody, string? chaveDestino, bool sucesso, string? mensagemErro, long duracaoMs);
}

public class EnvioRepositorio : IEnvioRepositorio
{
    private readonly IFabricaConexao _fabricaConexao;
    private readonly IValidadorTabela _validadorTabela;

    public EnvioRepositorio(IFabricaConexao fabricaConexao, IValidadorTabela validadorTabela)
    {
        _fabricaConexao = fabricaConexao ?? throw new ArgumentNullException(nameof(fabricaConexao));
        _validadorTabela = validadorTabela ?? throw new ArgumentNullException(nameof(validadorTabela));
    }

    public async Task<int> LiberarRegistrosPresosTimeoutAsync(string empresaId, int timeoutMinutos)
    {
        using var conexaoConfig = _fabricaConexao.CriarConexaoConfig();
        const string sql = @"
            UPDATE [integ].[Controle]
            SET Status = 'PENDENTE', DataAlteracao = SYSDATETIME()
            WHERE EmpresaId = @EmpresaId 
              AND Status = 'PROCESSANDO'
              AND InicioProcessamento < DATEADD(minute, -@TimeoutMinutos, SYSDATETIME());";

        return await conexaoConfig.ExecuteAsync(sql, new { EmpresaId = empresaId, TimeoutMinutos = timeoutMinutos });
    }

    public async Task<IEnumerable<RegistroFilaSzz>> ReservarLoteEnvioAsync(Empresa empresa, Fluxo fluxo, int tamanhoLote, string jobId)
    {
        var nomeTabelaFilaEscapado = await _validadorTabela.ValidarEObterNomeTabelaAsync(empresa, fluxo.TabelaFila);

        using var conexaoProtheus = _fabricaConexao.CriarConexaoProtheus(empresa);
        using var conexaoConfig = _fabricaConexao.CriarConexaoConfig();

        // 1. Consultar candidatos da SZZ do Protheus
        var sqlProtheus = $@"
            SELECT TOP (@TamanhoLote * 2)
                   R_E_C_N_O_ AS Recno,
                   ZZ_FILIAL AS Filial,
                   ZZ_CODIGO AS Codigo,
                   ZZ_SEQUEN AS Sequen,
                   ZZ_ENTID AS Entidade,
                   ZZ_CHVORI AS ChaveOrigem,
                   ZZ_VERBO AS Verbo,
                   ZZ_JSON AS JsonData,
                   ZZ_STATUS AS Status
            FROM {nomeTabelaFilaEscapado}
            WHERE D_E_L_E_T_ = ' '
              AND ZZ_TIPO = 'S'
              AND ZZ_STATUS IN ('1', '3')
            ORDER BY ZZ_CODIGO ASC, ZZ_SEQUEN ASC;";

        var candidatosProtheus = (await conexaoProtheus.QueryAsync<RegistroFilaSzz>(sqlProtheus, new { TamanhoLote = tamanhoLote })).ToList();
        if (candidatosProtheus.Count == 0)
        {
            return Enumerable.Empty<RegistroFilaSzz>();
        }

        var loteReservado = new List<RegistroFilaSzz>();

        // 2. Fazer reserva atômica no integ.Controle do BJ_INTEGRADOR por Recno
        const string sqlInsertControle = @"
            IF NOT EXISTS (
                SELECT 1 FROM [integ].[Controle] 
                WHERE EmpresaId = @EmpresaId AND Tabela = @Tabela AND Recno = @Recno AND Status = 'PROCESSANDO'
            )
            BEGIN
                MERGE INTO [integ].[Controle] AS Target
                USING (SELECT @EmpresaId AS EmpresaId, @Tabela AS Tabela, @Recno AS Recno) AS Source
                ON Target.EmpresaId = Source.EmpresaId AND Target.Tabela = Source.Tabela AND Target.Recno = Source.Recno
                WHEN MATCHED AND Target.Status <> 'PROCESSANDO' THEN
                    UPDATE SET Status = 'PROCESSANDO', Tentativas = Target.Tentativas + 1, InicioProcessamento = SYSDATETIME(), JobId = @JobId, DataAlteracao = SYSDATETIME()
                WHEN NOT MATCHED THEN
                    INSERT (EmpresaId, Tabela, Recno, Status, Tentativas, InicioProcessamento, JobId, DataAlteracao)
                    VALUES (@EmpresaId, @Tabela, @Recno, 'PROCESSANDO', 1, SYSDATETIME(), @JobId, SYSDATETIME());
                SELECT 1;
            END
            ELSE
            BEGIN
                SELECT 0;
            END";

        foreach (var item in candidatosProtheus)
        {
            if (loteReservado.Count >= tamanhoLote)
            {
                break;
            }

            var reservou = await conexaoConfig.ExecuteScalarAsync<int>(sqlInsertControle, new
            {
                EmpresaId = empresa.EmpresaId,
                Tabela = fluxo.TabelaFila.Trim().ToUpperInvariant(),
                Recno = item.Recno,
                JobId = jobId
            });

            if (reservou == 1)
            {
                loteReservado.Add(item);
            }
        }

        return loteReservado;
    }

    public async Task AtualizarResultadoEnvioAsync(
        Empresa empresa,
        Fluxo fluxo,
        RegistroFilaSzz registro,
        int httpStatus,
        string respostaBody,
        string? chaveDestino,
        bool sucesso,
        string? mensagemErro,
        long duracaoMs)
    {
        var nomeTabelaFilaEscapado = await _validadorTabela.ValidarEObterNomeTabelaAsync(empresa, fluxo.TabelaFila);
        var agora = DateTime.Now;
        var dataExec = agora.Date;
        var horaExec = agora.ToString("HH:mm:ss");

        var statusSzz = sucesso ? "2" : "3";
        var statusControle = sucesso ? "PROCESSADO" : "ERRO";

        // 1. Atualizar SZZ no Protheus
        using var conexaoProtheus = _fabricaConexao.CriarConexaoProtheus(empresa);
        var sqlUpdateSzz = $@"
            UPDATE {nomeTabelaFilaEscapado}
            SET ZZ_STATUS = @StatusSzz,
                ZZ_HTTP = @HttpStatus,
                ZZ_RETORN = @RespostaBody,
                ZZ_CHVDES = ISNULL(@ChaveDestino, ZZ_CHVDES),
                ZZ_DTEXEC = @DataExec,
                ZZ_HREXEC = @HoraExec
            WHERE R_E_C_N_O_ = @Recno AND D_E_L_E_T_ = ' ';";

        await conexaoProtheus.ExecuteAsync(sqlUpdateSzz, new
        {
            StatusSzz = statusSzz,
            HttpStatus = httpStatus,
            RespostaBody = respostaBody,
            ChaveDestino = chaveDestino ?? string.Empty,
            DataExec = dataExec,
            HoraExec = horaExec,
            Recno = registro.Recno
        });

        // 2. Atualizar integ.Controle e inserir integ.Log no BJ_INTEGRADOR
        using var conexaoConfig = _fabricaConexao.CriarConexaoConfig();

        const string sqlUpdateControle = @"
            UPDATE [integ].[Controle]
            SET Status = @StatusControle,
                UltimoErro = @MensagemErro,
                DataAlteracao = SYSDATETIME()
            WHERE EmpresaId = @EmpresaId AND Tabela = @Tabela AND Recno = @Recno;";

        await conexaoConfig.ExecuteAsync(sqlUpdateControle, new
        {
            StatusControle = statusControle,
            MensagemErro = mensagemErro,
            EmpresaId = empresa.EmpresaId,
            Tabela = fluxo.TabelaFila.Trim().ToUpperInvariant(),
            Recno = registro.Recno
        });

        // 3. Gravar log sanitizado em integ.Log
        const string sqlInsertLog = @"
            INSERT INTO [integ].[Log] (
                EmpresaId, FluxoId, Tabela, Recno, Direcao, Url, Metodo, 
                PayloadEnviado, RespostaRecebida, HttpStatus, DuracaoMs, Sucesso, MensagemErro, DataHora
            )
            VALUES (
                @EmpresaId, @FluxoId, @Tabela, @Recno, 'ENVIO', @Url, @Metodo, 
                @PayloadEnviado, @RespostaRecebida, @HttpStatus, @DuracaoMs, @Sucesso, @MensagemErro, SYSDATETIME()
            );";

        var urlFormatada = $"{empresa.BaseUrl.TrimEnd('/')}/{fluxo.Endpoint.TrimStart('/')}";
        await conexaoConfig.ExecuteAsync(sqlInsertLog, new
        {
            EmpresaId = empresa.EmpresaId,
            FluxoId = fluxo.FluxoId,
            Tabela = fluxo.TabelaFila.Trim().ToUpperInvariant(),
            Recno = registro.Recno,
            Url = urlFormatada,
            Metodo = string.IsNullOrWhiteSpace(registro.Verbo) ? fluxo.Metodo : registro.Verbo,
            PayloadEnviado = SanitizadorLogs.Sanitizar(registro.JsonData),
            RespostaRecebida = SanitizadorLogs.Sanitizar(respostaBody),
            HttpStatus = httpStatus,
            DuracaoMs = duracaoMs,
            Sucesso = sucesso,
            MensagemErro = mensagemErro
        });
    }
}
