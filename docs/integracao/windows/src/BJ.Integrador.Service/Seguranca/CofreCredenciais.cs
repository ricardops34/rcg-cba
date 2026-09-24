using Microsoft.AspNetCore.DataProtection;

namespace BJ.Integrador.Service.Seguranca;

public interface ICofreCredenciais
{
    string Proteger(string texto);
    string Revelar(string textoCriptografado);
}

public class CofreCredenciais : ICofreCredenciais
{
    private const string PurposeString = "BJ.Integrador.Credenciais.v1";
    private readonly IDataProtector _protector;

    public CofreCredenciais(IDataProtectionProvider provider)
    {
        ArgumentNullException.ThrowIfNull(provider);
        _protector = provider.CreateProtector(PurposeString);
    }

    public string Proteger(string texto)
    {
        if (string.IsNullOrEmpty(texto))
        {
            return string.Empty;
        }

        return _protector.Protect(texto);
    }

    public string Revelar(string textoCriptografado)
    {
        if (string.IsNullOrEmpty(textoCriptografado))
        {
            return string.Empty;
        }

        return _protector.Unprotect(textoCriptografado);
    }
}
