import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { IntegracaoModule } from './modules/integracao/integracao.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // A API é consumida por outra origem (web) e serve assets embutidos via <img>
  // (logos em /uploads). O CORP padrão "same-origin" bloquearia esse embed
  // cross-origin, então liberamos para "cross-origin" (o acesso já é controlado
  // por CORS + autenticação nas rotas de dados).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ZodValidationPipe());

  const config = new DocumentBuilder()
    .setTitle('Plataforma Comercial — API de Integração ERP')
    .setDescription(
      'Documentação pública só da API de integração com ERP externo — as rotas ' +
        'de uso interno do frontend (login, cadastros, permissões etc.) não são ' +
        'documentadas aqui.\n\n' +
        '**Autenticação**: só via header `x-api-key` (nunca login de usuário). ' +
        'Chaves são criadas e revogadas na tela Administração > Integração ' +
        '(requer permissão integracao.cadastrar); a chave em claro só é exibida ' +
        'uma única vez, na criação.',
    )
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description:
          'Chave da API de integração ERP — ver Administração > Integração',
      },
      'apiKey',
    )
    .build();
  const document = cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, config, { include: [IntegracaoModule] }),
  );
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
