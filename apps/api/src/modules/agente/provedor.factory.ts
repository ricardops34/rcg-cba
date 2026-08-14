import { Injectable } from '@nestjs/common';
import { AnthropicClient } from './anthropic.client';
import { OpenAiCompativelClient } from './openai-compativel.client';
import type { ProvedorClient } from './provedor-ia';
import type { ProvedorIa } from '@plataforma/contracts';

/**
 * Escolhe o adaptador conforme o provedor configurado.
 *
 * xAI, Groq e OpenAI compartilham o mesmo cliente porque compartilham o mesmo
 * formato de API; a Anthropic tem o seu. É o único lugar do agente que sabe
 * que existe mais de um formato — o laço de conversa fala só com
 * `ProvedorClient`.
 */
@Injectable()
export class ProvedorFactory {
  constructor(
    private readonly openaiCompativel: OpenAiCompativelClient,
    private readonly anthropic: AnthropicClient,
  ) {}

  para(provedor: ProvedorIa): ProvedorClient {
    return provedor === 'anthropic' ? this.anthropic : this.openaiCompativel;
  }
}
