using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Polly;
using Polly.Retry;
using Serilog;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Service.Integracao;

public class RespostaHttpResult
{
    public int StatusCode { get; set; }
    public string Body { get; set; } = string.Empty;
    public bool Sucesso { get; set; }
    public string? Erro { get; set; }
    public long DuracaoMs { get; set; }
    public string? ChaveDestino { get; set; }
}

public interface IClienteHttpResiliente
{
    Task<RespostaHttpResult> EnviarRegistroAsync(Empresa empresa, Fluxo fluxo, RegistroFilaSzz registro, CancellationToken cancellationToken = default);
}

public class ClienteHttpResiliente : IClienteHttpResiliente
{
    private readonly HttpClient _httpClient;
    private readonly ICofreCredenciais _cofreCredenciais;

    public ClienteHttpResiliente(HttpClient httpClient, ICofreCredenciais cofreCredenciais)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _cofreCredenciais = cofreCredenciais ?? throw new ArgumentNullException(nameof(cofreCredenciais));
    }

    public async Task<RespostaHttpResult> EnviarRegistroAsync(Empresa empresa, Fluxo fluxo, RegistroFilaSzz registro, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(empresa);
        ArgumentNullException.ThrowIfNull(fluxo);
        ArgumentNullException.ThrowIfNull(registro);

        var stopwatch = Stopwatch.StartNew();

        var baseUrl = empresa.BaseUrl.TrimEnd('/');
        var endpoint = fluxo.Endpoint.TrimStart('/');

        // Substituir parâmetros de rota ex: /integracao/notas-saida/{chave}/xml
        if (endpoint.Contains("{chave}", StringComparison.OrdinalIgnoreCase))
        {
            endpoint = endpoint.Replace("{chave}", registro.ChaveOrigem, StringComparison.OrdinalIgnoreCase);
        }

        var fullUrl = $"{baseUrl}/{endpoint}";
        var verbo = !string.IsNullOrWhiteSpace(registro.Verbo) ? registro.Verbo.Trim().ToUpperInvariant() : fluxo.Metodo.Trim().ToUpperInvariant();

        using var request = new HttpRequestMessage(new HttpMethod(verbo), fullUrl);

        // Configurar Autenticação
        if (!string.IsNullOrWhiteSpace(empresa.CredencialCriptografada))
        {
            var credencialRevelada = _cofreCredenciais.Revelar(empresa.CredencialCriptografada);
            if (!string.IsNullOrWhiteSpace(credencialRevelada))
            {
                if (string.Equals(empresa.AuthTipo, "Bearer", StringComparison.OrdinalIgnoreCase))
                {
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credencialRevelada);
                }
                else
                {
                    request.Headers.Add("x-api-key", credencialRevelada);
                }
            }
        }

        // Configurar Payload se não for GET/DELETE
        if (verbo != "GET" && verbo != "DELETE" && !string.IsNullOrWhiteSpace(registro.JsonData))
        {
            request.Content = new StringContent(registro.JsonData, Encoding.UTF8, "application/json");
        }

        // Configurar Resiliência (Retry Exponencial conforme MaxRetentativas do fluxo)
        var maxRetentativas = Math.Max(1, fluxo.MaxRetentativas);
        var pipeline = new ResiliencePipelineBuilder<HttpResponseMessage>()
            .AddRetry(new RetryStrategyOptions<HttpResponseMessage>
            {
                ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
                    .Handle<HttpRequestException>()
                    .HandleResult(r => (int)r.StatusCode == 429 || (int)r.StatusCode >= 500),
                MaxRetryAttempts = maxRetentativas,
                Delay = TimeSpan.FromSeconds(2),
                BackoffType = DelayBackoffType.Exponential
            })
            .Build();

        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(TimeSpan.FromSeconds(Math.Max(5, fluxo.TimeoutSeg)));

            var response = await pipeline.ExecuteAsync(async token => await _httpClient.SendAsync(request, token), cts.Token);
            stopwatch.Stop();

            var responseBody = await response.Content.ReadAsStringAsync(cts.Token);
            var httpStatus = (int)response.StatusCode;
            var sucesso = response.IsSuccessStatusCode;

            string? chaveDestino = null;
            if (sucesso && !string.IsNullOrWhiteSpace(responseBody))
            {
                try
                {
                    using var doc = JsonDocument.Parse(responseBody);
                    if (doc.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        if (doc.RootElement.TryGetProperty("id", out var idProp))
                        {
                            chaveDestino = idProp.ToString();
                        }
                        else if (doc.RootElement.TryGetProperty("codigoErp", out var codProp))
                        {
                            chaveDestino = codProp.ToString();
                        }
                    }
                }
                catch
                {
                    // Ignore JSON parsing if body is plain text or empty
                }
            }

            return new RespostaHttpResult
            {
                StatusCode = httpStatus,
                Body = responseBody,
                Sucesso = sucesso,
                Erro = sucesso ? null : $"HTTP {httpStatus}: {SanitizadorLogs.Sanitizar(responseBody)}",
                DuracaoMs = stopwatch.ElapsedMilliseconds,
                ChaveDestino = chaveDestino
            };
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            return new RespostaHttpResult
            {
                StatusCode = 0,
                Body = string.Empty,
                Sucesso = false,
                Erro = $"Falha na requisição HTTP para {fullUrl}: {ex.Message}",
                DuracaoMs = stopwatch.ElapsedMilliseconds
            };
        }
    }
}
