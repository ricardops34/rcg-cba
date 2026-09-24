using System.Net;
using System.Text;
using Moq;
using Moq.Protected;
using Xunit;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Integracao;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Tests;

public class EnvioFluxoTests
{
    [Fact]
    public async Task EnviarRegistroAsync_ComSucesso_RetornaChaveDestinoEStatus200()
    {
        // Arrange
        var mockHandler = new Mock<HttpMessageHandler>();
        var jsonResponseBody = "{\"id\":\"PROD-12345\",\"codigoErp\":\"PROD-12345\"}";

        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(jsonResponseBody, Encoding.UTF8, "application/json")
            });

        var httpClient = new HttpClient(mockHandler.Object);
        var mockCofre = new Mock<ICofreCredenciais>();
        mockCofre.Setup(c => c.Revelar(It.IsAny<string>())).Returns("token_decrypted");

        var cliente = new ClienteHttpResiliente(httpClient, mockCofre.Object);

        var empresa = new Empresa { EmpresaId = "01", BaseUrl = "https://api.exemplo.com", CredencialCriptografada = "enc_token" };
        var fluxo = new Fluxo { FluxoId = "PRODUTOS_ENVIO", Endpoint = "/integracao/produtos", Metodo = "POST", TimeoutSeg = 30, MaxRetentativas = 1 };
        var registro = new RegistroFilaSzz { Recno = 1, ChaveOrigem = "0001", Verbo = "POST", JsonData = "{\"descricao\":\"Produto Teste\"}" };

        // Act
        var resultado = await cliente.EnviarRegistroAsync(empresa, fluxo, registro);

        // Assert
        Assert.True(resultado.Sucesso);
        Assert.Equal(200, resultado.StatusCode);
        Assert.Equal("PROD-12345", resultado.ChaveDestino);
    }
}
