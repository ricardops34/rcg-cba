using System.ComponentModel;
using Hangfire;
using Hangfire.Storage;
using Serilog;
using BJ.Integrador.Service.Dados;

namespace BJ.Integrador.Service.Jobs;

public interface ISincronizadorFluxosJob
{
    Task SincronizarAsync();
}

public class SincronizadorFluxosJob : ISincronizadorFluxosJob
{
    private readonly IConfigRepositorio _configRepositorio;
    private readonly IRecurringJobManager _recurringJobManager;

    public SincronizadorFluxosJob(IConfigRepositorio configRepositorio, IRecurringJobManager recurringJobManager)
    {
        _configRepositorio = configRepositorio ?? throw new ArgumentNullException(nameof(configRepositorio));
        _recurringJobManager = recurringJobManager ?? throw new ArgumentNullException(nameof(recurringJobManager));
    }

    [DisplayName("Sincronizador de Fluxos da Integração")]
    [DisableConcurrentExecution(timeoutInSeconds: 120)]
    public async Task SincronizarAsync()
    {
        Log.Information("Iniciando sincronização de fluxos agendados no Hangfire...");

        var fluxosAtivos = (await _configRepositorio.ObterFluxosAtivosAsync()).ToList();
        var idsFluxosAtivosDesejados = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var fluxo in fluxosAtivos)
        {
            var jobId = $"{fluxo.EmpresaId}:{fluxo.FluxoId}";
            idsFluxosAtivosDesejados.Add(jobId);

            _recurringJobManager.AddOrUpdate<IExecutarFluxoJob>(
                recurringJobId: jobId,
                methodCall: job => job.ExecutarAsync(fluxo.EmpresaId, fluxo.FluxoId),
                cronExpression: fluxo.Cron,
                options: new RecurringJobOptions
                {
                    TimeZone = TimeZoneInfo.Local
                });

            Log.Debug("RecurringJob '{JobId}' sincronizado com a expressão cron '{Cron}'.", jobId, fluxo.Cron);
        }

        // Remover jobs recorrentes de fluxos/empresas inativos
        using (var connection = JobStorage.Current.GetConnection())
        {
            var jobsExistentes = connection.GetRecurringJobs();
            foreach (var job in jobsExistentes)
            {
                // Ignorar o próprio sincronizador de fluxos
                if (string.Equals(job.Id, "SincronizadorFluxos", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                if (!idsFluxosAtivosDesejados.Contains(job.Id))
                {
                    _recurringJobManager.RemoveIfExists(job.Id);
                    Log.Information("RecurringJob inativo '{JobId}' foi removido do Hangfire.", job.Id);
                }
            }
        }

        Log.Information("Sincronização de fluxos concluída. {Quantidade} fluxos ativos configurados.", fluxosAtivos.Count);
    }
}
