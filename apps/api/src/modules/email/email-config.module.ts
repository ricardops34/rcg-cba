import { Module } from '@nestjs/common';
import { ParametrosModule } from '../parametros/parametros.module';
import { EmailConfigController } from './email-config.controller';
import { EmailConfigService } from './email-config.service';

@Module({
  imports: [ParametrosModule],
  controllers: [EmailConfigController],
  providers: [EmailConfigService],
  // Documentos por e-mail e senha do vendedor conferem a funcionalidade aqui.
  exports: [EmailConfigService],
})
export class EmailConfigModule {}
