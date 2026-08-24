import { Injectable } from '@nestjs/common';
import { AnthropicClient } from './anthropic.client';
import { CodexClient } from './codex.client';
import { OpenAiCompativelClient } from './openai-compativel.client';
import type { ProvedorClient } from './provedor-ia';
import type { ProvedorIa } from '@plataforma/contracts';

/**
 * Escolhe o adaptador conforme o provedor configurado.
 *
 * A OpenAI usa o cliente do formato `chat/completions`; a Anthropic tem o seu
 * (Messages API) e o Codex tem o dele (Responses API num backend privado). É o
 * único lugar do agente que sabe que existe mais de um formato — o laço de
 * conversa fala só com `ProvedorClient`.
 */
@Injectable()
export class ProvedorFactory {
  constructor(
    private readonly openaiCompativel: OpenAiCompativelClient,
    private readonly anthropic: AnthropicClient,
    private readonly codex: CodexClient,
  ) {}

  para(provedor: ProvedorIa): ProvedorClient {
    if (provedor === 'anthropic') return this.anthropic;
    if (provedor === 'codex') return this.codex;
    return this.openaiCompativel;
  }
}
