namespace BJ.Integrador.Service.Config;

public class Controle
{
    public string EmpresaId { get; set; } = string.Empty;
    public string Tabela { get; set; } = string.Empty;
    public long Recno { get; set; }
    public string Status { get; set; } = string.Empty; // PENDENTE | PROCESSANDO | PROCESSADO | ERRO
    public int Tentativas { get; set; }
    public DateTime? InicioProcessamento { get; set; }
    public string? UltimoErro { get; set; }
    public string? JobId { get; set; }
    public DateTime DataAlteracao { get; set; }
}
