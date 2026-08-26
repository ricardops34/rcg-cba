import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import {
  PrismaService,
  type TenantTx,
} from '../../common/prisma/prisma.service';
import type { PoliticaSenha } from '@plataforma/contracts';
import { ParametrosService } from '../parametros/parametros.service';

/**
 * Chaves em Administração > Parâmetros. Antes isto era uma tabela singleton
 * **global** com tela própria; virou parâmetro **por empresa** por decisão do
 * usuário em 2026-08-26, junto com o enxugamento das rotinas de Administração.
 */
export const PARAMETRO = {
  tamanhoMinimo: 'SENHA_TAMANHO_MINIMO',
  tamanhoMaximo: 'SENHA_TAMANHO_MAXIMO',
  exigirMaiuscula: 'SENHA_EXIGIR_MAIUSCULA',
  exigirMinuscula: 'SENHA_EXIGIR_MINUSCULA',
  exigirNumero: 'SENHA_EXIGIR_NUMERO',
  exigirEspecial: 'SENHA_EXIGIR_ESPECIAL',
  diasParaExpirar: 'SENHA_DIAS_PARA_EXPIRAR',
  historicoQuantidade: 'SENHA_HISTORICO_QUANTIDADE',
  tentativasAntesBloqueio: 'SENHA_TENTATIVAS_ANTES_BLOQUEIO',
  minutosBloqueio: 'SENHA_MINUTOS_BLOQUEIO',
} as const;

/**
 * O formato vive em `@plataforma/contracts` porque as telas de senha leem a
 * política vigente por `GET /politica-senha` para montar os requisitos — o
 * tipo tem de ser o mesmo dos dois lados. Reexportado aqui porque auth,
 * usuários e vendedores já o importam deste módulo.
 */
export type { PoliticaSenha };

export const POLITICA_PADRAO: PoliticaSenha = {
  tamanhoMinimo: 8,
  tamanhoMaximo: 0,
  exigirMaiuscula: true,
  exigirMinuscula: false,
  exigirNumero: true,
  exigirEspecial: false,
  diasParaExpirar: 0,
  historicoQuantidade: 0,
  tentativasAntesBloqueio: 5,
  minutosBloqueio: 15,
};

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly parametros: ParametrosService,
  ) {}

  /** A política de **uma** empresa. */
  async getVigenteDaEmpresa(empresaId: string): Promise<PoliticaSenha> {
    const num = (chave: string, padrao: number) =>
      this.parametros.obterNumero(empresaId, chave, padrao);
    const bool = (chave: string, padrao: boolean) =>
      this.parametros.obterBoolean(empresaId, chave, padrao);

    const [
      tamanhoMinimo,
      tamanhoMaximo,
      exigirMaiuscula,
      exigirMinuscula,
      exigirNumero,
      exigirEspecial,
      diasParaExpirar,
      historicoQuantidade,
      tentativasAntesBloqueio,
      minutosBloqueio,
    ] = await Promise.all([
      num(PARAMETRO.tamanhoMinimo, POLITICA_PADRAO.tamanhoMinimo),
      num(PARAMETRO.tamanhoMaximo, POLITICA_PADRAO.tamanhoMaximo),
      bool(PARAMETRO.exigirMaiuscula, POLITICA_PADRAO.exigirMaiuscula),
      bool(PARAMETRO.exigirMinuscula, POLITICA_PADRAO.exigirMinuscula),
      bool(PARAMETRO.exigirNumero, POLITICA_PADRAO.exigirNumero),
      bool(PARAMETRO.exigirEspecial, POLITICA_PADRAO.exigirEspecial),
      num(PARAMETRO.diasParaExpirar, POLITICA_PADRAO.diasParaExpirar),
      num(PARAMETRO.historicoQuantidade, POLITICA_PADRAO.historicoQuantidade),
      num(
        PARAMETRO.tentativasAntesBloqueio,
        POLITICA_PADRAO.tentativasAntesBloqueio,
      ),
      num(PARAMETRO.minutosBloqueio, POLITICA_PADRAO.minutosBloqueio),
    ]);

    return this.sanear({
      tamanhoMinimo,
      tamanhoMaximo,
      exigirMaiuscula,
      exigirMinuscula,
      exigirNumero,
      exigirEspecial,
      diasParaExpirar,
      historicoQuantidade,
      tentativasAntesBloqueio,
      minutosBloqueio,
    });
  }

  /**
   * A política que vale para **um usuário**: a mais restritiva entre as
   * empresas ativas dele.
   *
   * A conta é uma só, e a senha é da conta, não da empresa. Se a empresa A
   * exige 12 caracteres e a B exige 8, aceitar 8 enfraqueceria o acesso à A —
   * pela porta da B. Decisão do usuário em 2026-08-26, ao tornar a política por
   * empresa; até então ela era um singleton global e a pergunta não existia.
   *
   * Usuário sem empresa ativa (ainda não vinculado) cai no padrão: é o mesmo
   * comportamento de antes, e negar login por falta de política seria pior.
   */
  async getVigenteParaUsuario(usuarioId: string): Promise<PoliticaSenha> {
    const vinculos = await this.prisma.usuarioEmpresa.findMany({
      where: { usuarioId, ativo: true },
      select: { empresaId: true },
    });
    if (vinculos.length === 0) return POLITICA_PADRAO;

    const politicas = await Promise.all(
      vinculos.map((v) => this.getVigenteDaEmpresa(v.empresaId)),
    );
    return politicas.reduce((a, b) => this.maisRestritiva(a, b));
  }

  /**
   * Regra a regra, o lado mais exigente vence.
   *
   * Nos limites que **liberam** (tamanho máximo, dias para expirar), o zero
   * significa "sem limite" — então ele perde de qualquer número, e não ganha
   * como se fosse o menor valor. É o inverso do que um `Math.min` ingênuo
   * faria, e trocar isso afrouxaria a política em silêncio.
   */
  private maisRestritiva(a: PoliticaSenha, b: PoliticaSenha): PoliticaSenha {
    const menorNaoZero = (x: number, y: number) =>
      x === 0 ? y : y === 0 ? x : Math.min(x, y);

    return {
      tamanhoMinimo: Math.max(a.tamanhoMinimo, b.tamanhoMinimo),
      tamanhoMaximo: menorNaoZero(a.tamanhoMaximo, b.tamanhoMaximo),
      exigirMaiuscula: a.exigirMaiuscula || b.exigirMaiuscula,
      exigirMinuscula: a.exigirMinuscula || b.exigirMinuscula,
      exigirNumero: a.exigirNumero || b.exigirNumero,
      exigirEspecial: a.exigirEspecial || b.exigirEspecial,
      diasParaExpirar: menorNaoZero(a.diasParaExpirar, b.diasParaExpirar),
      historicoQuantidade: Math.max(
        a.historicoQuantidade,
        b.historicoQuantidade,
      ),
      // Menos tentativas e mais tempo bloqueado são o lado restritivo.
      tentativasAntesBloqueio: menorNaoZero(
        a.tentativasAntesBloqueio,
        b.tentativasAntesBloqueio,
      ),
      minutosBloqueio: Math.max(a.minutosBloqueio, b.minutosBloqueio),
    };
  }

  /**
   * Na tela de Parâmetros cada linha é editada sozinha, sem o formulário que
   * antes validava os campos em conjunto. Nada impede alguém de gravar máximo
   * menor que o mínimo — e aí **nenhuma** senha seria aceita, com uma mensagem
   * que não explica nada. Aqui o par incoerente é tratado como "sem máximo".
   */
  private sanear(p: PoliticaSenha): PoliticaSenha {
    const semMaximoValido =
      p.tamanhoMaximo > 0 && p.tamanhoMaximo < p.tamanhoMinimo;
    return semMaximoValido ? { ...p, tamanhoMaximo: 0 } : p;
  }

  /**
   * Valida uma senha candidata contra uma política já resolvida. É a fonte de
   * verdade da força da senha — o Zod de `usuarioCreateSchema`/`changePasswordSchema`
   * só garante formato básico, porque os requisitos reais vêm dos parâmetros.
   */
  validarSenhaContra(senha: string, politica: PoliticaSenha): void {
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

  /** Troca de senha de um usuário que já existe: vale a política da conta. */
  async validarSenhaDoUsuario(usuarioId: string, senha: string): Promise<void> {
    this.validarSenhaContra(senha, await this.getVigenteParaUsuario(usuarioId));
  }

  /**
   * Usuário sendo criado: ele ainda não tem vínculo, então a política é a da
   * empresa que o está criando. Se ele for vinculado a outra depois, a próxima
   * troca de senha já usa a combinação — a senha atual não é revalidada, como
   * nunca foi ao mudar a política.
   */
  async validarSenhaDaEmpresa(empresaId: string, senha: string): Promise<void> {
    this.validarSenhaContra(senha, await this.getVigenteDaEmpresa(empresaId));
  }

  /**
   * Gera uma senha aleatória (não é escolhida pelo usuário, então pode ser
   * bem mais forte que o mínimo) que já satisfaz a política da empresa —
   * sempre inclui as 4 categorias de caractere, independente do que a
   * política exige, porque variedade a mais nunca viola a validação.
   * Usada em fluxos de provisionamento (ex.: criar usuário para vendedor).
   */
  async gerarSenhaProvisoria(empresaId: string): Promise<string> {
    const politica = await this.getVigenteDaEmpresa(empresaId);
    let tamanho = Math.max(
      politica.tamanhoMinimo,
      SENHA_PROVISORIA_TAMANHO_BASE,
    );
    if (politica.tamanhoMaximo) {
      tamanho = Math.min(tamanho, politica.tamanhoMaximo);
    }

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

    const politica = await this.getVigenteParaUsuario(usuarioId);
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
