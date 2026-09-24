using System.Text.RegularExpressions;

namespace BJ.Integrador.Service.Seguranca;

public static partial class SanitizadorLogs
{
    private static readonly Regex SensitivePatternsRegex = new(
        @"(Authorization\s*:\s*Bearer\s+|Bearer\s+|x-api-key\s*:\s*|password\s*[:=]\s*|senha\s*[:=]\s*|credencial\s*[:=]\s*)([^""'\s;,]+)",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static string Sanitizar(string? texto)
    {
        if (string.IsNullOrWhiteSpace(texto))
        {
            return string.Empty;
        }

        return SensitivePatternsRegex.Replace(texto, "$1***OMITTED***");
    }

    public static IDictionary<string, string> SanitizarHeaders(IDictionary<string, string>? headers)
    {
        var resultado = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (headers == null)
        {
            return resultado;
        }

        foreach (var kvp in headers)
        {
            if (EsChaveSensivel(kvp.Key))
            {
                resultado[kvp.Key] = "***OMITTED***";
            }
            else
            {
                resultado[kvp.Key] = Sanitizar(kvp.Value);
            }
        }

        return resultado;
    }

    public static bool EsChaveSensivel(string nomeChave)
    {
        if (string.IsNullOrWhiteSpace(nomeChave))
        {
            return false;
        }

        var chave = nomeChave.Trim();
        return chave.Equals("Authorization", StringComparison.OrdinalIgnoreCase) ||
               chave.Equals("x-api-key", StringComparison.OrdinalIgnoreCase) ||
               chave.Equals("ApiKey", StringComparison.OrdinalIgnoreCase) ||
               chave.Equals("Password", StringComparison.OrdinalIgnoreCase) ||
               chave.Equals("Token", StringComparison.OrdinalIgnoreCase) ||
               chave.Equals("Credencial", StringComparison.OrdinalIgnoreCase);
    }
}
