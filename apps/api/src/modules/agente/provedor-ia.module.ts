import { Module } from '@nestjs/common';
import { AgenteConfigService } from './agente-config.service';
import { OpenAiCompativelClient } from './openai-compativel.client';
import { AnthropicClient } from './anthropic.client';
import { CodexClient } from './codex.client';
import { CodexOAuthService } from './codex-oauth.service';
import { ProvedorFactory } from './provedor.factory';

/**
 * A camada de IA, sem o agente.
 *
 * Existe porque dois consumidores muito diferentes precisam dela: o agente
 * interno (`AgenteModule`) e a triagem do WhatsApp institucional
 * (`WhatsappModule`). O que eles compartilham é só isto — credencial da
 * empresa, escolha de provedor e o cliente HTTP. Prompt, ferramentas e
 * permissões são de cada um, e é o que deve continuar separado.
 *
 * Extrair também desfaz um ciclo: `AgenteModule` já importa `WhatsappModule`
 * (para as ferramentas de WhatsApp do assistente), então o WhatsApp importar o
 * agente de volta fecharia o laço. Com este módulo no meio, os dois importam
 * para baixo e ninguém aponta para o outro.
 */
@Module({
  providers: [
    AgenteConfigService,
    OpenAiCompativelClient,
    AnthropicClient,
    CodexClient,
    CodexOAuthService,
    ProvedorFactory,
  ],
  exports: [AgenteConfigService, ProvedorFactory],
})
export class ProvedorIaModule {}
