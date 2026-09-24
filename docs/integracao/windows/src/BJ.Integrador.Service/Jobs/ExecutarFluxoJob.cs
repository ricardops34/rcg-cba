using System.ComponentModel;
using Hangfire;
using Serilog;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Dados;
using BJ.Integrador.Service.Integracao;

namespace BJ.Integrador.Service.Jobs;

public interface IExecutarFluxoJob
{
    Task ExecutarAsync(string empresaId, string fluxoId);
}

public class ExecutarFluxoJob : IExecutarFluxoJob
{
    private readonly IConfigRepositorio _configRepositorio;
    private readonly IEnvioRepositorio _envioRepositorio;
    private readonly IClienteHttpResiliente _clienteHttp;
    private readonly IProcessadorRecebimento _processadorRecebimento;

    public ExecutarFluxoJob(
        IConfigRepositorio configRepositorio,
        IEnvioRepositorio envioRepositorio,
        IClienteHttpResiliente clienteHttp,
        IProcessadorRecebimento processadorRecebimento)
    {
        _configRepositorio = configRepositorio ?? throw new ArgumentNullException(nameof(configRepositorio));
        _envioRepositorio = envioRepositorio ?? throw new ArgumentNullException(nameof(envioRepositorio));
        _clienteHttp = clienteHttp ?? throw new ArgumentNullException(nameof(clienteHttp));
        _processadorRecebimento = processadorRecebimento ?? throw new ArgumentNullException(nameof(processadorRecebimento));
    }

    [DisplayName("Processar Fluxo: {0}:{1}")]
    [DisableConcurrentExecution(timeoutInSeconds: 300)]
    [AutomaticRetry(Attempts = 0)]
    public async Task ExecutarAsync(string empresaId, string fluxoId)
    {
        var jobId = $"{empresaId}:{fluxoId}";
        Log.Information("Iniciando execução do fluxo {EmpresaId}:{FluxoId}...", empresaId, fluxoId);

        var fluxo = await _configRepositorio.ObterFluxoAsync(empresaId, fluxoId);
        if (fluxo == null || !fluxo.Ativo)
        {
            Log.Warning("Fluxo {EmpresaId}:{FluxoId} não encontrado ou inativo. Execução ignorada.", empresaId, fluxoId);
            return;
        }

        var empresa = await _configRepositorio.ObterEmpresaPorIdAsync(empresaId);
        if (empresa == null || !empresa.Ativo)
        {
            Log.Warning("Empresa {EmpresaId} não encontrada ou inativa. Execução ignorada.", empresaId);
            return;
        }

        if (string.Equals(fluxo.Direcao, "ENVIO", StringComparison.OrdinalIgnoreCase))
        {
            await ProcessarEnvioAsync(empresa, fluxo, jobId);
        }
        else if (string.Equals(fluxo.Direcao, "RECEBIMENTO", StringComparison.OrdinalIgnoreCase))
        {
            await _processadorRecebimento.ProcessarRecebimentoAsync(empresa, fluxo);
        }
    }

    private async Task ProcessarEnvioAsync(Empresa empresa, Fluxo fluxo, string jobId)
    {
        // 1. Liberar registros presos em 'PROCESSANDO' por timeout
        var timeoutMinTexto = await _configRepositorio.ObterParametroValorAsync(empresa.EmpresaId, fluxo.FluxoId, "TimeoutProcessamentoMin");
        var timeoutMin = int.TryParse(timeoutMinTexto, out var t) ? t : 15;

        var liberados = await _envioRepositorio.LiberarRegistrosPresosTimeoutAsync(empresa.EmpresaId, timeoutMin);
        if (liberados > 0)
        {
            Log.Information("Liberados {Quantidade} registros presos em 'PROCESSANDO' há mais de {TimeoutMin} min para a empresa {EmpresaId}.", liberados, timeoutMin, empresa.EmpresaId);
        }

        // 2. Reservar lote de mensagens da SZZ
        var registrosReservados = (await _envioRepositorio.ReservarLoteEnvioAsync(empresa, fluxo, fluxo.TamanhoLote, jobId)).ToList();
        if (registrosReservados.Count == 0)
        {
            Log.Debug("Nenhum registro pendente para envio no fluxo {EmpresaId}:{FluxoId}.", empresa.EmpresaId, fluxo.FluxoId);
            return;
        }

        Log.Information("Reservados {Quantidade} registros da fila {TabelaFila} para envio no fluxo {EmpresaId}:{FluxoId}.", registrosReservados.Count, fluxo.TabelaFila, empresa.EmpresaId, fluxo.FluxoId);

        var sucessos = 0;
        var erros = 0;

        foreach (var item in registrosReservados)
        {
            var resultado = await _clienteHttp.EnviarRegistroAsync(empresa, fluxo, item);

            await _envioRepositorio.AtualizarResultadoEnvioAsync(
                empresa,
                fluxo,
                item,
                resultado.StatusCode,
                resultado.Body,
                resultado.ChaveDestino,
                resultado.Sucesso,
                resultado.Erro,
                resultado.DuracaoMs);

            if (resultado.Sucesso)
            {
                sucessos++;
            }
            else
            {
                erros++;
            }
        }

        Log.Information("Fluxo {EmpresaId}:{FluxoId} (ENVIO) concluído: {Sucessos} enviados com sucesso, {Erros} com erro.", empresa.EmpresaId, fluxo.FluxoId, sucessos, erros);
    }
}
