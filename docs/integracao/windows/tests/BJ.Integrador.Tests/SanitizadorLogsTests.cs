using Xunit;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Tests;

public class SanitizadorLogsTests
{
    [Fact]
    public void SanitizarHeaders_OcultaAuthorizationEXApiKey()
    {
        // Arrange
        var headers = new Dictionary<string, string>
        {
            { "Content-Type", "application/json" },
            { "Authorization", "Bearer token_super_secreto" },
            { "x-api-key", "chave_api_12345" }
        };

        // Act
        var headersSanitizados = SanitizadorLogs.SanitizarHeaders(headers);

        // Assert
        Assert.Equal("application/json", headersSanitizados["Content-Type"]);
        Assert.Equal("***OMITTED***", headersSanitizados["Authorization"]);
        Assert.Equal("***OMITTED***", headersSanitizados["x-api-key"]);
    }

    [Fact]
    public void Sanitizar_SubstituiTokenEmTexto()
    {
        // Arrange
        var textoLog = "Requisição enviada com Authorization: Bearer token123 para o endpoint";

        // Act
        var textoSanitizado = SanitizadorLogs.Sanitizar(textoLog);

        // Assert
        Assert.DoesNotContain("token123", textoSanitizado);
        Assert.Contains("***OMITTED***", textoSanitizado);
    }
}
