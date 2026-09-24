using System.Collections.Concurrent;
using System.Data;
using Dapper;
using BJ.Integrador.Service.Config;

namespace BJ.Integrador.Service.Dados;

public interface IValidadorTabela
{
    Task<string> ValidarEObterNomeTabelaAsync(Empresa empresa, string nomeTabela, CancellationToken cancellationToken = default);
    Task<string> ValidarEObterNomeTabelaAsync(IDbConnection conexaoProtheus, string empresaId, string nomeTabela, CancellationToken cancellationToken = default);
}

public class ValidadorTabela : IValidadorTabela
{
    private readonly IFabricaConexao _fabricaConexao;
    private readonly ConcurrentDictionary<(string EmpresaId, string Tabela), string> _cacheTabelasValidadas = new();

    public ValidadorTabela(IFabricaConexao fabricaConexao)
    {
        _fabricaConexao = fabricaConexao ?? throw new ArgumentNullException(nameof(fabricaConexao));
    }

    public async Task<string> ValidarEObterNomeTabelaAsync(Empresa empresa, string nomeTabela, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(empresa);
        if (string.IsNullOrWhiteSpace(nomeTabela))
        {
            throw new ArgumentException("O nome da tabela não pode ser nulo ou vazio.", nameof(nomeTabela));
        }

        (string EmpresaId, string Tabela) key = (empresa.EmpresaId, nomeTabela.Trim().ToUpperInvariant());
        if (_cacheTabelasValidadas.TryGetValue(key, out var tabelaFormatadaCached))
        {
            return tabelaFormatadaCached;
        }

        using var conexao = _fabricaConexao.CriarConexaoProtheus(empresa);
        var nomeFormatado = await ValidarInternoAsync(conexao, key.EmpresaId, key.Tabela);
        _cacheTabelasValidadas[key] = nomeFormatado;
        return nomeFormatado;
    }

    public async Task<string> ValidarEObterNomeTabelaAsync(IDbConnection conexaoProtheus, string empresaId, string nomeTabela, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(conexaoProtheus);
        if (string.IsNullOrWhiteSpace(nomeTabela))
        {
            throw new ArgumentException("O nome da tabela não pode ser nulo ou vazio.", nameof(nomeTabela));
        }

        (string EmpresaId, string Tabela) key = (empresaId, nomeTabela.Trim().ToUpperInvariant());
        if (_cacheTabelasValidadas.TryGetValue(key, out var tabelaFormatadaCached))
        {
            return tabelaFormatadaCached;
        }

        var nomeFormatado = await ValidarInternoAsync(conexaoProtheus, key.EmpresaId, key.Tabela);
        _cacheTabelasValidadas[key] = nomeFormatado;
        return nomeFormatado;
    }

    private static async Task<string> ValidarInternoAsync(IDbConnection conexao, string empresaId, string nomeTabelaLimpo)
    {
        const string sql = @"
            SELECT QUOTENAME(name) 
            FROM sys.tables 
            WHERE name = @NomeTabela AND type = 'U';";

        var nomeEscapado = await conexao.QueryFirstOrDefaultAsync<string>(sql, new { NomeTabela = nomeTabelaLimpo });

        if (string.IsNullOrWhiteSpace(nomeEscapado))
        {
            throw new InvalidOperationException($"A tabela '{nomeTabelaLimpo}' não foi encontrada em sys.tables do banco Protheus para a empresa '{empresaId}'.");
        }

        return nomeEscapado;
    }
}
