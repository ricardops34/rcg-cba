using Microsoft.AspNetCore.DataProtection;
using Xunit;
using BJ.Integrador.Service.Seguranca;

namespace BJ.Integrador.Tests;

public class CofreCredenciaisTests
{
    private readonly ICofreCredenciais _cofre;

    public CofreCredenciaisTests()
    {
        // Provider efêmero em memória para testes unitários
        var provider = DataProtectionProvider.Create("BJ.Integrador.Tests");
        _cofre = new CofreCredenciais(provider);
    }

    [Fact]
    public void ProtegerERevelar_RetornaTextoOriginal()
    {
        // Arrange
        var textoOriginal = "SenhaUltraSecreta123!";

        // Act
        var textoProtegido = _cofre.Proteger(textoOriginal);
        var textoRevelado = _cofre.Revelar(textoProtegido);

        // Assert
        Assert.NotNull(textoProtegido);
        Assert.NotEqual(textoOriginal, textoProtegido);
        Assert.Equal(textoOriginal, textoRevelado);
    }

    [Fact]
    public void Proteger_TextoVazio_RetornaVazio()
    {
        Assert.Equal(string.Empty, _cofre.Proteger(string.Empty));
        Assert.Equal(string.Empty, _cofre.Revelar(string.Empty));
    }
}
