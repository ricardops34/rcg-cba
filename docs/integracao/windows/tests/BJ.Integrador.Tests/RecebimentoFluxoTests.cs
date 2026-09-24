using System.Net;
using System.Text;
using Moq;
using Moq.Protected;
using Xunit;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Dados;
using BJ.Integrador.Service.Integracao;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Tests;

public class RecebimentoFluxoTests
{
    [Fact]
    public async Task ProcessarRecebimentoAsync_ComPaginacaoEIdempotencia_InsereEIgnoraDuplicado()
    {
        // Arrange
        var mockHandler = new Mock<HttpMessageHandler>();
        var jsonResponse = "[{\"id\":\"ORC-001\"}, {\"id\":\"ORC-002\"}]";

        mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(jsonResponse, Encoding.UTF8, "application/json")
            });

        var httpClient = new HttpClient(mockHandler.Object);
        var mockRecebRepo = new Mock<IRecebimentoRepositorio>();
        var mockCofre = new Mock<ICofreCredenciais>();

        // Simular que ORC-001 já foi processado e ORC-002 é novo
        mockRecebRepo.Setup(r => r.RegistroJaProcessadoAsync("01", "SC5010", "ORC-001")).ReturnsAsync(true);
        mockRecebRepo.Setup(r => r.RegistroJaProcessadoAsync("01", "SC5010", "ORC-002")).ReturnsAsync(false);

        var processador = new ProcessadorRecebimento(httpClient, mockRecebRepo.Object, mockCofre.Object);

        var empresa = new Empresa { EmpresaId = "01", BaseUrl = "https://api.exemplo.com" };
        var fluxo = new Fluxo { FluxoId = "ORCAMENTOS_RECEBIMENTO", TabelaFila = "SZY010", TabelaRetorno = "SC5010", Endpoint = "/integracao/orcamentos/pendentes", TamanhoLote = 100 };

        // Act
        await processador.ProcessarRecebimentoAsync(empresa, fluxo);

        // Assert: Apenas o registro novo ORC-002 deve ser inserido no Protheus
        mockRecebRepo.Verify(r => r.InserirRegistroRetornoProtheusAsync(
            It.IsAny<Empresa>(),
            It.IsAny<Fluxo>(),
            "ORC-002",
            It.IsAny<IDictionary<string, object>>()), Times.Once);

        mockRecebRepo.Verify(r => r.InserirRegistroRetornoProtheusAsync(
            It.IsAny<Empresa>(),
            It.IsAny<Fluxo>(),
            "ORC-001",
            It.IsAny<IDictionary<string, object>>()), Times.Never);
    }
}
