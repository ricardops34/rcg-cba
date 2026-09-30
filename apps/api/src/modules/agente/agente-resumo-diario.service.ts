import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { resolverEscopoVendedores } from '../../common/escopo/escopo-vendedores';
import { ObjetivosService } from '../objetivos/objetivos.service';
import { VendedoresService } from '../vendedores/vendedores.service';
import { AgenteMeuDiaService } from './agente-meu-dia.service';
import { AgenteConfigService } from './agente-config.service';
import { AgenteFerramentasService } from './agente-ferramentas.service';
import { dataDoResumo } from './dia-operacional';

const dinheiro = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

@Injectable()
export class AgenteResumoDiarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meuDia: AgenteMeuDiaService,
    private readonly config: AgenteConfigService,
    private readonly ferramentas: AgenteFerramentasService,
    private readonly objetivos: ObjetivosService,
    private readonly vendedores: VendedoresService,
  ) {}

  async consultar(user: AuthenticatedUser) {
    const empresaId = user.empresaAtivaId;
    const data = dataDoResumo();
    const config = await this.config.apresentacao(empresaId);
    if (!config.ativo) return null;
    const ferramentas = await this.ferramentas.disponiveisParaAjuda(
      empresaId,
      user,
    );
    if (!ferramentas.some((f) => f.chave === 'meu_dia')) return null;
    const exibido = await this.prisma.withTenant(empresaId, (tx) =>
      tx.agenteResumoExibido.findUnique({
        where: { empresaId_usuarioId: { empresaId, usuarioId: user.id } },
      }),
    );
    if (exibido?.data === data) return null;

    const dia = await this.meuDia.montar(empresaId, user);
    const linhas = [
      `Olá, ${dia.tratamento}! Aqui está seu resumo de ${data.split('-').reverse().join('/')}.`,
    ];
    if (dia.aniversario)
      linhas.push('Feliz aniversário! Desejo a você um excelente dia!');
    if (dia.agenda) {
      linhas.push(
        `**Agenda:** ${dia.agenda.hoje} compromisso(s) hoje e ${dia.agenda.atrasadas} pendência(s) atrasada(s).`,
      );
      linhas.push(
        ...dia.agenda.proximas.map((a) => `• ${a.titulo} — ${a.quando}`),
      );
      if (dia.agenda.hoje + dia.agenda.atrasadas > dia.agenda.proximas.length)
        linhas.push('Veja a agenda para consultar os demais compromissos.');
    }
    if (dia.meta) {
      const m = dia.meta;
      linhas.push(
        `**Sua meta do mês:** ${dinheiro(m.realizado)} de ${dinheiro(m.objetivo)} (${m.percentual.toLocaleString('pt-BR')}%).`,
      );
      if (m.objetivo > 0 && m.realizado >= m.objetivo)
        linhas.push('Parabéns, você atingiu a meta do mês!');
    }
    linhas.push(`**Avisos:** ${dia.recados} aviso(s) não lido(s) no sino.`);

    const vendedor = await this.vendedores.vendedorDoUsuario(empresaId, user);
    const gestor = user.isAdmin || vendedor?.tipo === 'superior';
    if (
      gestor &&
      ferramentas.some((f) => f.chave === 'execucao_objetivos_vendedores')
    ) {
      try {
        const equipe = await this.objetivos.dashboardGerencial(
          empresaId,
          user,
          {
            mes: Number(data.slice(5, 7)),
            ano: Number(data.slice(0, 4)),
          },
        );
        const comMeta = equipe.linhas.filter((v) => v.objetivo > 0);
        const atingiram = comMeta.filter((v) => v.realizado >= v.objetivo);
        linhas.push(
          `**Equipe no mês:** ${atingiram.length} de ${comMeta.length} vendedor(es) com meta cadastrada já atingiram o objetivo.`,
        );
        linhas.push(
          ...atingiram.map(
            (v) =>
              `• Parabéns a ${v.nome}: ${dinheiro(v.realizado)} de ${dinheiro(v.objetivo)}!`,
          ),
        );
      } catch {
        linhas.push('Os indicadores da equipe estão indisponíveis no momento.');
      }
    }
    if (
      gestor &&
      (user.isAdmin || user.permissoes.includes('vendedores.visualizar'))
    ) {
      try {
        const aniversariantes = await this.prisma.withTenant(
          empresaId,
          async (tx) => {
            const escopo = await resolverEscopoVendedores(tx, empresaId, user);
            const pessoas = await tx.vendedor.findMany({
              where: {
                empresaId,
                deletedAt: null,
                ativo: true,
                dataNascimento: { not: null },
                ...(escopo === null ? {} : { id: { in: escopo } }),
              },
              select: { nome: true, dataNascimento: true },
              orderBy: { nome: 'asc' },
            });
            return pessoas.filter(
              (v) =>
                v.dataNascimento?.toISOString().slice(5, 10) ===
                data.slice(5, 10),
            );
          },
        );
        if (aniversariantes.length)
          linhas.push(
            `**Aniversariantes da equipe hoje:** ${aniversariantes.map((v) => v.nome).join(', ')}.`,
          );
      } catch {
        linhas.push(
          'Não foi possível consultar os aniversariantes da equipe agora.',
        );
      }
    }
    linhas.push('Como posso ajudar mais?');
    return { data, texto: linhas.join('\n\n') };
  }

  async confirmar(user: AuthenticatedUser, data: string) {
    if (data !== dataDoResumo())
      throw new BadRequestException('Data do resumo inválida.');
    await this.prisma.withTenant(user.empresaAtivaId, (tx) =>
      tx.agenteResumoExibido.upsert({
        where: {
          empresaId_usuarioId: {
            empresaId: user.empresaAtivaId,
            usuarioId: user.id,
          },
        },
        create: { empresaId: user.empresaAtivaId, usuarioId: user.id, data },
        update: { data },
      }),
    );
    return { ok: true };
  }
}
