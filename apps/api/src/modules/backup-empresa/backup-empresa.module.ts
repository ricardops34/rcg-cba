import { Module } from '@nestjs/common';
import { PlataformaBackupsController } from './plataforma-backups.controller';
import { BackupsController } from './backups.controller';
import { BackupEmpresaService } from './backup-empresa.service';
import { BackupEmpresaVarreduraService } from './backup-empresa-varredura.service';

/** Backup por empresa (ver `docs/planos/2026-10-13-backup-por-empresa.md`). */
@Module({
  controllers: [PlataformaBackupsController, BackupsController],
  providers: [BackupEmpresaService, BackupEmpresaVarreduraService],
})
export class BackupEmpresaModule {}
