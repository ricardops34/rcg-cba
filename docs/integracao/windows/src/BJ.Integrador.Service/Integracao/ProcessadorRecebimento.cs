using System.Diagnostics;
using System.Text.Json;
using Serilog;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Dados;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Service.Integracao;

public interface IProcessadorRecebimento
{
    Task ProcessarRecebimentoAsync(Empresa empresa, Fluxo fluxo, CancellationToken cancellationToken = default);
}

public class ProcessadorRecebimento : IProcessadorRecebimento
{
    private readonly HttpClient _httpClient;
    private readonly IRecebimentoRepositorio _recebimentoRepositorio;
    private readonly ICofreCredenciais _cofreCredenciais;

    public ProcessadorRecebimento(
        HttpClient httpClient,
        IRecebimentoRepositorio recebimentoRepositorio,
        ICofreCredenciais cofreCredenciais)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _recebimentoRepositorio = recebimentoRepositorio ?? throw new ArgumentNullException(nameof(recebimentoRepositorio));
        _cofreCredenciais = cofreCredenciais ?? throw new ArgumentNullException(nameof(cofreCredenciais));
    }

    public async Task ProcessarRecebimentoAsync(Empresa empresa, Fluxo fluxo, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(empresa);
        ArgumentNullException.ThrowIfNull(fluxo);

        var pagina = 1;
        var pageSize = fluxo.TamanhoLote > 0 ? fluxo.TamanhoLote : 100;
        var temMaisPaginas = true;

        var totalLidos = 0;
        var totalProcessados = 0;
        var totalIgnorados = 0;

        while (temMaisPaginas && !cancellationToken.IsCancellationRequested)
        {
            var stopwatch = Stopwatch.StartNew();
            var baseUrl = empresa.BaseUrl.TrimEnd('/');
            var endpoint = fluxo.Endpoint.TrimStart('/');
            var url = $"{baseUrl}/{endpoint}?pageSize={pageSize}&page={pagina}";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);

            if (!string.IsNullOrWhiteSpace(empresa.CredencialCriptografada))
            {
                var credencial = _cofreCredenciais.Revelar(empresa.CredencialCriptografada);
                if (!string.IsNullOrWhiteSpace(credencial))
                {
                    if (string.Equals(empresa.AuthTipo, "Bearer", StringComparison.OrdinalIgnoreCase))
                    {
                        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", credencial);
                    }
                    else
                    {
                        request.Headers.Add("x-api-key", credencial);
                    }
                }
            }

            try
            {
                using var response = await _httpClient.SendAsync(request, cancellationToken);
                stopwatch.Stop();

                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                var httpStatus = (int)response.StatusCode;

                if (!response.IsSuccessStatusCode)
                {
                    Log.Error("Erro ao consultar recebimento no fluxo {EmpresaId}:{FluxoId} (HTTP {HttpStatus}): {Body}", empresa.EmpresaId, fluxo.FluxoId, httpStatus, SanitizadorLogs.Sanitizar(responseBody));
                    await _recebimentoRepositorio.RegistrarLogAsync(empresa.EmpresaId, fluxo.FluxoId, fluxo.TabelaFila, url, "GET", null, responseBody, httpStatus, stopwatch.ElapsedMilliseconds, false, $"HTTP {httpStatus}");
                    break;
                }

                await _recebimentoRepositorio.RegistrarLogAsync(empresa.EmpresaId, fluxo.FluxoId, fluxo.TabelaFila, url, "GET", null, responseBody, httpStatus, stopwatch.ElapsedMilliseconds, true, null);

                using var jsonDoc = JsonDocument.Parse(responseBody);
                JsonElement arrayItens;

                if (jsonDoc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    arrayItens = jsonDoc.RootElement;
                }
                else if (jsonDoc.RootElement.TryGetProperty("data", out var dataProp) && dataProp.ValueKind == JsonValueKind.Array)
                {
                    arrayItens = dataProp;
                }
                else
                {
                    Log.Warning("Resposta do fluxo {EmpresaId}:{FluxoId} não contêm array de dados.", empresa.EmpresaId, fluxo.FluxoId);
                    break;
                }

                var quantidadePagina = arrayItens.GetArrayLength();
                totalLidos += quantidadePagina;

                if (quantidadePagina == 0)
                {
                    break;
                }

                foreach (var item in arrayItens.EnumerateArray())
                {
                    var idOrigem = item.TryGetProperty("id", out var idProp) ? idProp.ToString() : string.Empty;
                    if (string.IsNullOrWhiteSpace(idOrigem))
                    {
                        totalIgnorados++;
                        continue;
                    }

                    // Checagem de Idempotência
                    var jaProcessado = await _recebimentoRepositorio.RegistroJaProcessadoAsync(empresa.EmpresaId, fluxo.TabelaRetorno ?? fluxo.TabelaFila, idOrigem);
                    if (jaProcessado)
                    {
                        totalIgnorados++;
                        continue;
                    }

                    // Processar item e gravar na tabela do Protheus
                    var camposProtheus = new Dictionary<string, object>
                    {
                        { "ZY_FILIAL", "01" },
                        { "ZY_STATUS", "1" }
                    };

                    await _recebimentoRepositorio.InserirRegistroRetornoProtheusAsync(empresa, fluxo, idOrigem, camposProtheus);
                    totalProcessados++;
                }

                if (quantidadePagina < pageSize)
                {
                    temMaisPaginas = false;
                }
                else
                {
                    pagina++;
                }
            }
            catch (Exception ex)
            {
                stopwatch.Stop();
                Log.Error(ex, "Exceção ao processar recebimento no fluxo {EmpresaId}:{FluxoId}.", empresa.EmpresaId, fluxo.FluxoId);
                await _recebimentoRepositorio.RegistrarLogAsync(empresa.EmpresaId, fluxo.FluxoId, fluxo.TabelaFila, url, "GET", null, null, 0, stopwatch.ElapsedMilliseconds, false, ex.Message);
                break;
            }
        }

        Log.Information("Fluxo {EmpresaId}:{FluxoId} (RECEBIMENTO) concluído: {Lidos} lidos, {Processados} processados, {Ignorados} ignorados.", empresa.EmpresaId, fluxo.FluxoId, totalLidos, totalProcessados, totalIgnorados);
    }
}
