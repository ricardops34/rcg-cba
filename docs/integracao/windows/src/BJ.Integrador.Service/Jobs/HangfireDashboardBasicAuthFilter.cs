using System.Net.Http.Headers;
using System.Text;
using Hangfire.Dashboard;

namespace BJ.Integrador.Service.Jobs;

public class HangfireDashboardBasicAuthFilter : IDashboardAuthorizationFilter
{
    private readonly string _usuarioEsperado;
    private readonly string _senhaEsperada;

    public HangfireDashboardBasicAuthFilter(IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        _usuarioEsperado = configuration["Dashboard:Usuario"] ?? "admin";
        _senhaEsperada = configuration["Dashboard:Senha"] ?? "admin_password";
    }

    public bool Authorize(DashboardContext context)
    {
        var httpContext = context.GetHttpContext();

        var headerAutorizacao = httpContext.Request.Headers["Authorization"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(headerAutorizacao))
        {
            ExigirAutenticacaoBasic(httpContext);
            return false;
        }

        try
        {
            var headerValue = AuthenticationHeaderValue.Parse(headerAutorizacao);
            if (!string.Equals(headerValue.Scheme, "Basic", StringComparison.OrdinalIgnoreCase) || string.IsNullOrEmpty(headerValue.Parameter))
            {
                ExigirAutenticacaoBasic(httpContext);
                return false;
            }

            var credenciaisTexto = Encoding.UTF8.GetString(Convert.FromBase64String(headerValue.Parameter));
            var partes = credenciaisTexto.Split(':', 2);
            if (partes.Length != 2)
            {
                ExigirAutenticacaoBasic(httpContext);
                return false;
            }

            var usuario = partes[0];
            var senha = partes[1];

            if (string.Equals(usuario, _usuarioEsperado, StringComparison.Ordinal) &&
                string.Equals(senha, _senhaEsperada, StringComparison.Ordinal))
            {
                return true;
            }
        }
        catch
        {
            // Tratar falha no parse do Base64
        }

        ExigirAutenticacaoBasic(httpContext);
        return false;
    }

    private static void ExigirAutenticacaoBasic(HttpContext httpContext)
    {
        httpContext.Response.Headers["WWW-Authenticate"] = "Basic realm=\"Dashboard BJ.Integrador\"";
        httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
    }
}
