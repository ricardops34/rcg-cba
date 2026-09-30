import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { IntegracaoModule } from './modules/integracao/integracao.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ErrosLogService } from './modules/erros/erros-log.service';
import { executarComContexto } from './common/prisma/contexto-banco';
import { linkValido, PREFIXO_ASSINADO } from './common/uploads/link-assinado';
import { posix } from 'node:path';

async function bootstrap() {
  // `rawBody: true` é o que faz `req.rawBody` existir — só passa a ser lido
  // pelo webhook da WhatsApp Cloud API, que precisa do corpo bruto para
  // conferir a assinatura HMAC-SHA256 da Meta. Não afeta as demais rotas: o
  // corpo continua sendo parseado como JSON normalmente.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Em produção a API fica atrás do Traefik (docker/stack.rcgcba.prod.yml), sem
  // porta publicada. Sem isto o Express toma o IP do Traefik como o de todo
  // mundo: o limite de login (10/min por IP) vira da empresa inteira — dez
  // tentativas de qualquer um travam o login de todos — e o log de acessos
  // grava o proxy. `1` = confia só no último salto (o Traefik), então um
  // X-Forwarded-For forjado pelo cliente não passa. TRUST_PROXY sobrepõe
  // (número de saltos); fora de produção, sem proxy, fica desligado.
  const trustProxy = process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? '1' : '');
  if (trustProxy) app.set('trust proxy', Number(trustProxy));

  // Contexto da RLS: cada requisição abre o seu, vazio; o JwtStrategy o preenche
  // ao validar o token, e o PrismaService o leva ao banco. Primeiro middleware,
  // para cobrir tudo o que vem depois.
  app.use((_req: unknown, _res: unknown, next: () => void) => executarComContexto({}, next));

  // A API é consumida por outra origem (web) e serve assets embutidos via <img>
  // (logos em /uploads). O CORP padrão "same-origin" bloquearia esse embed
  // cross-origin, então liberamos para "cross-origin" (o acesso já é controlado
  // por CORS + autenticação nas rotas de dados).
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: process.env.NODE_ENV === 'production',
      contentSecurityPolicy: false,
    }),
  );
  const allowedOrigins = (
    process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000', 'http://localhost:3002']
  ).map((s) => s.trim());
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== 'production' &&
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  });
  // /uploads é servido estático e sem login (logo, foto de produto, banner são
  // públicos). O que não é: anexos do agente e PDFs da importação de fichas só
  // o servidor lê — ninguém de fora tem motivo para baixar, então 404; a mídia
  // de conversa do WhatsApp só com link assinado e no prazo
  // (common/uploads/link-assinado.ts). Caminho normalizado antes de conferir,
  // para um `../` não contornar o bloqueio. Registrado antes do estático, que
  // o ServeStaticModule só liga no init.
  app.use((req: any, res: any, next: () => void) => {
    let caminho: string;
    try {
      caminho = posix.normalize(decodeURIComponent(req.path ?? ''));
    } catch {
      return res.status(400).end();
    }
    if (!caminho.startsWith('/uploads/')) return next();
    if (caminho.startsWith('/uploads/agente/') || caminho.startsWith('/uploads/fichas-importacao/')) {
      return res.status(404).end();
    }
    if (caminho.startsWith(PREFIXO_ASSINADO) && !linkValido(caminho, req.query?.exp, req.query?.sig)) {
      return res.status(403).end();
    }
    next();
  });

  // Os parsers abaixo valem para todas as rotas (o Nest não os limita por
  // caminho), mas só estas precisam de corpo grande. Este filtro roda antes
  // deles: as demais — inclusive login e as outras rotas públicas — recusam
  // corpo acima de 2 MB antes de alguém ler o corpo inteiro, e o corpo
  // compactado da carga só é aceito na rota da carga. Confere o
  // Content-Length declarado; envio sem ele (chunked) segue barrado pelo teto
  // do parser.
  const CORPO_GRANDE = ['/api/v1/whatsapp/interno', '/api/v1/integracao/'];
  const TIPOS_DA_CARGA = /^application\/(x-)?gzip|^application\/x-ndjson/i;
  app.use((req: any, res: any, next: () => void) => {
    const caminho: string = req.path ?? '';
    const tipo: string = req.headers?.['content-type'] ?? '';
    if (TIPOS_DA_CARGA.test(tipo) && !caminho.startsWith('/api/v1/integracao/cargas')) {
      return res.status(415).json({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Tipo de conteúdo não aceito nesta rota' });
    }
    const tamanho = Number(req.headers?.['content-length'] ?? 0);
    if (tamanho > 2 * 1024 * 1024 && !CORPO_GRANDE.some((p) => caminho.startsWith(p))) {
      return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Corpo da requisição grande demais' });
    }
    next();
  });

  // O padrão do Express é 100 kB, e a mídia de WhatsApp chega do worker em
  // base64 pela rota interna — um áudio de meio minuto já estoura esse teto.
  // 24 MB cobre o limite de 16 MB do próprio WhatsApp mais o inchaço do
  // base64. Vale só para JSON; upload de arquivo continua indo por multipart.
  app.useBodyParser('json', { limit: '24mb' });
  // Carga por arquivo (POST /integracao/cargas): o corpo é o próprio arquivo,
  // compactado ou não, e chega como Buffer. Só estes Content-Types — nenhuma
  // outra rota os usa. O teto é o de INTEGRACAO_CARGA_MAX_BYTES.
  app.useBodyParser('raw', {
    type: ['application/gzip', 'application/x-gzip', 'application/x-ndjson'],
    limit: '100mb',
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // O filtro é `@Catch()` global e captura tudo num ponto só — é por ele que o
  // log de erros recebe o lado servidor (ver docs/planos/log-de-erros.md). O
  // serviço vem do container em vez de o filtro ser registrado por
  // `APP_FILTER`, para não mexer na ordem de registro já estabelecida aqui.
  app.useGlobalFilters(new AllExceptionsFilter(app.get(ErrosLogService)));
  app.useGlobalPipes(new ZodValidationPipe());

  const swaggerEnabled = process.env.SWAGGER_ENABLED !== 'false';
  if (swaggerEnabled) {
    const jwtService = new JwtService();

    app.use(['/api/docs', '/api/docs-json'], (req: any, res: any, next: any) => {
      if (
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test' ||
        process.env.SWAGGER_PUBLIC === 'true'
      ) {
        return next();
      }

      const authHeader = req.headers?.authorization;
      let token: string | undefined;

      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      } else if (req.cookies && req.cookies.access_token) {
        token = req.cookies.access_token;
      } else if (req.query && typeof req.query.token === 'string') {
        token = req.query.token;
      }

      if (token && process.env.JWT_ACCESS_SECRET) {
        try {
          jwtService.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
          return next();
        } catch {
          // Token inválido ou expirado
        }
      }

      const swaggerUser = process.env.SWAGGER_USER;
      const swaggerPass = process.env.SWAGGER_PASSWORD;
      if (
        swaggerUser &&
        swaggerPass &&
        authHeader &&
        typeof authHeader === 'string' &&
        authHeader.startsWith('Basic ')
      ) {
        const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf8');
        const [user, pass] = credentials.split(':');
        if (user === swaggerUser && pass === swaggerPass) {
          return next();
        }
      }

      res.setHeader('WWW-Authenticate', 'Basic realm="Documentacao ERP (Swagger)"');
      return res.status(401).send('Acesso à documentação Swagger requer autenticação.');
    });

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
  }

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
