using System.Data;
using Moq;
using Xunit;
using BJ.Integrador.Service.Config;
using BJ.Integrador.Service.Dados;

namespace BJ.Integrador.Tests;

public class ValidadorTabelaTests
{
    [Fact]
    public async Task ValidarEObterNomeTabelaAsync_ComNomeInvalido_LancaArgumentException()
    {
        // Arrange
        var mockFabrica = new Mock<IFabricaConexao>();
        var validador = new ValidadorTabela(mockFabrica.Object);
        var empresa = new Empresa { EmpresaId = "01" };

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(() => validador.ValidarEObterNomeTabelaAsync(empresa, ""));
    }
}
