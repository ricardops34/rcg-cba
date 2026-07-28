import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import type { PoliticaSenhaUpdate } from '@plataforma/contracts';

const SINGLETON_ID = 'singleton';

const DEFAULTS = {
  id: SINGLETON_ID,
  tamanhoMinimo: 8,
  tamanhoMaximo: null,
  exigirMaiuscula: true,
  exigirMinuscula: false,
  exigirNumero: true,
  exigirEspecial: false,
  diasParaExpirar: null,
  historicoQuantidade: 0,
  tentativasAntesBloqueio: 5,
  minutosBloqueio: 15,
} as const;

const CARACTERE_ESPECIAL_REGEX = /[^A-Za-z0-9]/;

// Sem caracteres ambíguos (0/O, 1/l/I) para facilitar digitação manual da
// senha provisória, caso o usuário precise copiar do e-mail digitando.
const SENHA_PROVISORIA_CHARSET = {
  maiuscula: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  minuscula: 'abcdefghijkmnpqrstuvwxyz',
  numero: '23456789',
  especial: '!@#$%&*?',
};
const SENHA_PROVISORIA_TAMANHO_BASE = 14;

@Injectable()
export class PoliticaSenhaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lê os parâmetros vigentes, criando a linha singleton com os defaults na
   * primeira chamada (upsert idempotente — não depende de seed rodar antes).
   */
  async getVigente() {
    return this.prisma.politicaSenha.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: DEFAULTS,
    });
  }

  async update(input: PoliticaSenhaUpdate, actorId: string) {
    await this.getVigente();
    return this.prisma.politicaSenha.update({
      where: { id: SINGLETON_ID },
      data: { ...input, updatedBy: actorId },
    });
  }

  /**
   * Valida uma senha candidata contra a política vigente. É a fonte de
   * verdade da força da senha — o Zod de `usuarioCreateSchema`/`changePasswordSchema`
   * só garante formato básico, porque os requisitos reais vêm do banco.
   */
  async validarSenha(senha: string): Promise<void> {
    const politica = await this.getVigente();
    const violacoes: string[] = [];

    if (senha.length < politica.tamanhoMinimo) {
      violacoes.push(`Mínimo de ${politica.tamanhoMinimo} caracteres`);
    }
    if (politica.tamanhoMaximo && senha.length > politica.tamanhoMaximo) {
      violacoes.push(`Máximo de ${politica.tamanhoMaximo} caracteres`);
    }
    if (politica.exigirMaiuscula && !/[A-Z]/.test(senha)) {
      violacoes.push('Deve conter ao menos uma letra maiúscula');
    }
    if (politica.exigirMinuscula && !/[a-z]/.test(senha)) {
      violacoes.push('Deve conter ao menos uma letra minúscula');
    }
    if (politica.exigirNumero && !/[0-9]/.test(senha)) {
      violacoes.push('Deve conter ao menos um número');
    }
    if (politica.exigirEspecial && !CARACTERE_ESPECIAL_REGEX.test(senha)) {
      violacoes.push('Deve conter ao menos um caractere especial');
    }

    if (violacoes.length > 0) {
      throw new BadRequestException(violacoes.join('; '));
    }
  }

  /**
   * Gera uma senha aleatória (não é escolhida pelo usuário, então pode ser
   * bem mais forte que o mínimo) que já satisfaz a política vigente —
   * sempre inclui as 4 categorias de caractere, independente do que a
   * política exige, porque variedade a mais nunca viola `validarSenha`.
   * Usada em fluxos de provisionamento (ex.: criar usuário para vendedor).
   */
  async gerarSenhaProvisoria(): Promise<string> {
    const politica = await this.getVigente();
    let tamanho = Math.max(politica.tamanhoMinimo, SENHA_PROVISORIA_TAMANHO_BASE);
    if (politica.tamanhoMaximo) tamanho = Math.min(tamanho, politica.tamanhoMaximo);

    const categorias = Object.values(SENHA_PROVISORIA_CHARSET);
    const todos = categorias.join('');
    const senha = categorias.map((c) => c[randomInt(c.length)]);
    while (senha.length < tamanho) senha.push(todos[randomInt(todos.length)]);

    // Fisher-Yates com randomInt (criptograficamente seguro, não Math.random).
    for (let i = senha.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [senha[i], senha[j]] = [senha[j], senha[i]];
    }

    return senha.join('');
  }

  /**
   * Impede reutilizar a senha atual ou uma das últimas N do histórico,
   * conforme `historicoQuantidade` (0 = não valida reuso).
   */
  async validarReuso(
    usuarioId: string,
    senhaPlano: string,
    hashAtual: string,
  ): Promise<void> {
    if (await bcrypt.compare(senhaPlano, hashAtual)) {
      throw new BadRequestException(
        'A nova senha deve ser diferente da senha atual',
      );
    }

    const politica = await this.getVigente();
    if (politica.historicoQuantidade <= 0) return;

    const historico = await this.prisma.senhaHistorico.findMany({
      where: { usuarioId },
      orderBy: { createdAt: 'desc' },
      take: politica.historicoQuantidade,
    });

    for (const linha of historico) {
      if (await bcrypt.compare(senhaPlano, linha.senhaHash)) {
        throw new BadRequestException(
          'Não é possível reutilizar uma senha recente',
        );
      }
    }
  }

  /** Grava o hash que está sendo substituído (não o novo) para checagem futura de reuso. */
  async registrarHistorico(
    usuarioId: string,
    hashSubstituido: string,
    tx?: TenantTx,
  ) {
    const client = tx ?? this.prisma;
    await client.senhaHistorico.create({
      data: { usuarioId, senhaHash: hashSubstituido },
    });
  }
}
