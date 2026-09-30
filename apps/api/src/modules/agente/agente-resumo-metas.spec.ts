import { AgenteChatService } from './agente-chat.service';
import type { Ferramenta } from './agente-tools.service';

describe('resultado de metas enviado ao modelo', () => {
  it('preserva os vendedores além do oitavo e mantém o limite padrão das demais ferramentas', () => {
    const service = Object.create(AgenteChatService.prototype) as AgenteChatService;
    const dados = { vendedores: Array.from({ length: 50 }, (_, i) => ({ objetivo: 100, realizado: i, metaAtingida: false })) };
    const ferramenta = { limiteItens: 50, limiteCaracteres: 16000 } as Ferramenta;
    const resumo = service['resumirResultado'](dados, ferramenta);
    expect(JSON.parse(resumo).vendedores).toHaveLength(50);
    expect(resumo).not.toContain('omitidos');
    expect(service['resumirResultado'](dados)).toContain('42 item(ns) omitidos');
  });
});
