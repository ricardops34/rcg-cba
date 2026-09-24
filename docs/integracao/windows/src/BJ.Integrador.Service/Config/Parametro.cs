namespace BJ.Integrador.Service.Config;

public class Parametro
{
    public int Id { get; set; }
    public string EmpresaId { get; set; } = string.Empty;
    public string? FluxoId { get; set; }
    public string Chave { get; set; } = string.Empty;
    public string? Valor { get; set; }
}
