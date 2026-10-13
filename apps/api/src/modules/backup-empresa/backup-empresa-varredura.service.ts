import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BackupEmpresaService } from './backup-empresa.service';

/** A cada hora confere quem está sem backup agendado dentro da frequência. */
const INTERVALO_MS = 60 * 60_000;

/** Primeira passagem alguns minutos depois de subir, fora do pico do boot. */
const PRIMEIRA_MS = 5 * 60_000;

/**
 * Agendamento do backup das empresas, no padrão das outras varreduras
 * (`erros-varredura.service.ts`): `setInterval` dentro da API, sem fila. Uma
 * passagem por vez — se a anterior ainda gera (empresa grande), esta pula.
 */
@Injectable()
export class BackupEmpresaVarreduraService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BackupEmpresaVarreduraService.name);
  private timers: NodeJS.Timeout[] = [];
  private rodando = false;

  constructor(private readonly backups: BackupEmpresaService) {}

  onModuleInit() {
    void this.backups
      .aoSubir()
      .catch((erro) =>
        this.logger.error(`Limpeza dos backups na subida: ${String(erro)}`),
      );
    const primeira = setTimeout(() => void this.varrer(), PRIMEIRA_MS);
    const periodica = setInterval(() => void this.varrer(), INTERVALO_MS);
    // `unref` para os timers não segurarem o processo no encerramento.
    primeira.unref();
    periodica.unref();
    this.timers = [primeira, periodica];
  }

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
  }

  async varrer() {
    if (this.rodando) return;
    this.rodando = true;
    try {
      const { gerados } = await this.backups.agendados();
      if (gerados) this.logger.log(`Backups agendados gerados: ${gerados}.`);
    } catch (erro) {
      this.logger.error(`Falha no agendamento dos backups: ${String(erro)}`);
    } finally {
      this.rodando = false;
    }
  }
}
