namespace BJ.Integrador.Service.Config;

public class Empresa
{
    public string EmpresaId { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = string.Empty;
    public string AuthTipo { get; set; } = string.Empty;
    public string? CredencialCriptografada { get; set; }
    public string? ConnectionStringProtheus { get; set; }
    public bool Ativo { get; set; }
    public DateTime DataAlteracao { get; set; }
}
