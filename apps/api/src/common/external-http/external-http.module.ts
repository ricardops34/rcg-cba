import { Global, Module } from '@nestjs/common';
import { ExternalHttpService } from './external-http.service';

/**
 * Global porque as fontes públicas são consumidas por módulos distintos
 * (Clientes, CEPs) e o serviço não guarda estado — declarar em cada um só
 * repetiria import sem ganho.
 */
@Global()
@Module({
  providers: [ExternalHttpService],
  exports: [ExternalHttpService],
})
export class ExternalHttpModule {}
