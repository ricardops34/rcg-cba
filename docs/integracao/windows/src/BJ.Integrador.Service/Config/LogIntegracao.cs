namespace BJ.Integrador.Service.Config;

public class LogIntegracao
{
    public long Id { get; set; }
    public string EmpresaId { get; set; } = string.Empty;
    public string FluxoId { get; set; } = string.Empty;
    public string Tabela { get; set; } = string.Empty;
    public long? Recno { get; set; }
    public string Direcao { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string Metodo { get; set; } = string.Empty;
    public string? PayloadEnviado { get; set; }
    public string? RespostaRecebida { get; set; }
    public int? HttpStatus { get; set; }
    public long? DuracaoMs { get; set; }
    public bool Sucesso { get; set; }
    public string? MensagemErro { get; set; }
    public DateTime DataHora { get; set; } = DateTime.UtcNow;
}
