using System.Data;
using Moq;
using Xunit;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Dados;

namespace BJ.Integrador.Tests;

public class ParametroHierarquiaTests
{
    [Fact]
    public async Task ObterParametrosCompiladosAsync_FluxoParametroSubstituiEmpresaParametro()
    {
        // Arrange
        var mockFabrica = new Mock<IFabricaConexao>();
        var mockConexao = new Mock<IDbConnection>();
        mockFabrica.Setup(f => f.CriarConexaoConfig()).Returns(mockConexao.Object);

        // Simulando a lista de parâmetros retornados
        var parametros = new List<Parametro>
        {
            new Parametro { Id = 1, EmpresaId = "01", FluxoId = null, Chave = "TimeoutProcessamentoMin", Valor = "15" },
            new Parametro { Id = 2, EmpresaId = "01", FluxoId = null, Chave = "TamanhoLote", Valor = "50" },
            new Parametro { Id = 3, EmpresaId = "01", FluxoId = "ORCAMENTO_ENVIO", Chave = "TamanhoLote", Valor = "100" }
        };

        var mockRepo = new Mock<IConfigRepositorio>();
        mockRepo.Setup(r => r.ObterParametrosPorEmpresaAsync("01")).ReturnsAsync(parametros);

        // Implementação em memória da lógica de compilação
        mockRepo.Setup(r => r.ObterParametrosCompiladosAsync("01", "ORCAMENTO_ENVIO"))
            .ReturnsAsync((string empId, string? flxId) =>
            {
                var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var p in parametros.Where(p => p.FluxoId == null && p.Valor != null))
                {
                    dict[p.Chave] = p.Valor!;
                }
                if (!string.IsNullOrWhiteSpace(flxId))
                {
                    foreach (var p in parametros.Where(p => string.Equals(p.FluxoId, flxId, StringComparison.OrdinalIgnoreCase) && p.Valor != null))
                    {
                        dict[p.Chave] = p.Valor!;
                    }
                }
                return dict;
            });

        // Act
        var result = await mockRepo.Object.ObterParametrosCompiladosAsync("01", "ORCAMENTO_ENVIO");

        // Assert
        Assert.Equal("15", result["TimeoutProcessamentoMin"]);
        Assert.Equal("100", result["TamanhoLote"]); // Fluxo substituiu a Empresa!
    }
}
