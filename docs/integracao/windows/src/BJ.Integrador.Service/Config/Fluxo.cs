namespace BJ.Integrador.Service.Config;

public class Fluxo
{
    public string FluxoId { get; set; } = string.Empty;
    public string EmpresaId { get; set; } = string.Empty;
    public string Direcao { get; set; } = string.Empty; // ENVIO | RECEBIMENTO
    public string TabelaFila { get; set; } = string.Empty;
    public string? TabelaRetorno { get; set; }
    public string Endpoint { get; set; } = string.Empty;
    public string Metodo { get; set; } = string.Empty;
    public string Cron { get; set; } = string.Empty;
    public int TamanhoLote { get; set; } = 50;
    public int TimeoutSeg { get; set; } = 30;
    public int MaxRetentativas { get; set; } = 3;
    public bool Ativo { get; set; }
    public DateTime DataAlteracao { get; set; }
}
