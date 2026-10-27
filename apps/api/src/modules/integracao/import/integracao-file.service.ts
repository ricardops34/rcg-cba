import { Injectable, BadRequestException } from '@nestjs/common';
import { IntegracaoProdutosService } from '../produtos/integracao-produtos.service';
import { IntegracaoClientesService } from '../clientes/integracao-clientes.service';
import { IntegracaoVendedoresService } from '../vendedores/integracao-vendedores.service';
import { IntegracaoCategoriasService } from '../categorias/integracao-categorias.service';
import { IntegracaoRegrasDescontoService } from '../regras-desconto/integracao-regras-desconto.service';
import { IntegracaoCondicoesPagamentoService } from '../condicoes-pagamento/integracao-condicoes-pagamento.service';
import { IntegracaoArmazensService } from '../armazens/integracao-armazens.service';
import { IntegracaoTabelasPrecoService } from '../tabelas-preco/integracao-tabelas-preco.service';
import { IntegracaoEstoqueService } from '../estoque/integracao-estoque.service';
import { IntegracaoFornecedoresService } from '../fornecedores/integracao-fornecedores.service';
import { IntegracaoNotasSaidaService } from '../notas-saida/integracao-notas-saida.service';
import { IntegracaoNotasEntradaService } from '../notas-entrada/integracao-notas-entrada.service';
import { IntegracaoTitulosReceberService } from '../titulos-receber/integracao-titulos-receber.service';
import { IntegracaoObjetivosService } from '../objetivos/integracao-objetivos.service';
import { IntegracaoOrcamentosService } from '../orcamentos/integracao-orcamentos.service';
import { IntegracaoCargasService } from '../cargas/integracao-cargas.service';
import { EntidadesCarga } from '../cargas/entidades-carga';
import { INTEGRACAO_CARGA_ENTIDADES, type IntegracaoCargaEntidade } from '@plataforma/contracts';

export interface ItemArquivoImportacao {
  lote?: string;
  seq?: string;
  entidade: string;
  verbo?: string;
  chave: string;
  payload: any;
}

export interface ResultadoImportacaoArquivo {
  total: number;
  processados: number;
  criados: number;
  atualizados: number;
  excluidos: number;
  erros: Array<{ linha: number; chave?: string; mensagem: string }>;
}

@Injectable()
export class IntegracaoFileService {
  constructor(
    private readonly produtosService: IntegracaoProdutosService,
    private readonly clientesService: IntegracaoClientesService,
    private readonly vendedoresService: IntegracaoVendedoresService,
    private readonly categoriasService: IntegracaoCategoriasService,
    private readonly regrasDescontoService: IntegracaoRegrasDescontoService,
    private readonly condicoesPagtoService: IntegracaoCondicoesPagamentoService,
    private readonly armazensService: IntegracaoArmazensService,
    private readonly tabelasPrecoService: IntegracaoTabelasPrecoService,
    private readonly estoqueService: IntegracaoEstoqueService,
    private readonly fornecedoresService: IntegracaoFornecedoresService,
    private readonly notasSaidaService: IntegracaoNotasSaidaService,
    private readonly notasEntradaService: IntegracaoNotasEntradaService,
    private readonly titulosReceberService: IntegracaoTitulosReceberService,
    private readonly objetivosService: IntegracaoObjetivosService,
    private readonly orcamentosService: IntegracaoOrcamentosService,
    private readonly cargas: IntegracaoCargasService,
    private readonly entidades: EntidadesCarga,
  ) {}

  /**
   * Processa o conteúdo de um arquivo TXT/JSON com linhas JSON (JSON Lines ou Array).
   */
  async importarArquivo(
    empresaId: string,
    apiKeyId: string,
    conteudo: string,
  ): Promise<ResultadoImportacaoArquivo> {
    if (!conteudo || typeof conteudo !== 'string') {
      throw new BadRequestException('Conteúdo do arquivo não fornecido ou inválido.');
    }

    // Linha que não é JSON, ou sem `entidade`, **vira erro** do resultado: antes
    // era descartada em silêncio, e o ERP achava que a linha tinha entrado.
    const errosDeLeitura: { linha: number; mensagem: string }[] = [];
    const itens: { posicao: number; item: ItemArquivoImportacao }[] = [];
    const aceitar = (posicao: number, valor: unknown) => {
      const item = valor as ItemArquivoImportacao | null;
      if (!item || typeof item !== 'object' || typeof item.entidade !== 'string' || !item.entidade) {
        errosDeLeitura.push({ linha: posicao, mensagem: 'Item sem "entidade".' });
        return;
      }
      itens.push({ posicao, item });
    };

    let comoArray: unknown[] | null = null;
    try {
      const lido: unknown = JSON.parse(conteudo);
      if (Array.isArray(lido)) comoArray = lido;
    } catch {
      // Não é um array JSON único: lê linha a linha (JSON Lines).
    }
    if (comoArray) {
      comoArray.forEach((v, i) => aceitar(i + 1, v));
    } else {
      conteudo
        .split(/\r?\n/)
        .map((texto, i) => ({ texto, linha: i + 1 }))
        .filter((l) => l.texto.trim().length > 0)
        .forEach(({ texto, linha }) => {
          try {
            aceitar(linha, JSON.parse(texto));
          } catch {
            errosDeLeitura.push({ linha, mensagem: 'Linha não é um JSON válido.' });
          }
        });
    }

    // Endpoint desligado no monitor vale para o arquivo também (a mesma regra
    // do `PUT` e da carga): recusa o arquivo inteiro, sem aplicar nada.
    await this.cargas.conferirEndpointsAtivos(
      empresaId,
      [...new Set(itens.map((i) => this.nomeDaEntidade(i.item.entidade)))],
    );

    const resultado: ResultadoImportacaoArquivo = {
      total: itens.length + errosDeLeitura.length,
      processados: 0,
      criados: 0,
      atualizados: 0,
      excluidos: 0,
      erros: [...errosDeLeitura],
    };

    for (const { posicao, item } of itens) {
      try {
        const acao = await this.processarItem(empresaId, apiKeyId, item);
        resultado.processados++;
        if (acao === 'criado') resultado.criados++;
        else if (acao === 'atualizado') resultado.atualizados++;
        else if (acao === 'excluido') resultado.excluidos++;
      } catch (erro) {
        resultado.erros.push({
          linha: posicao,
          chave: item.chave || undefined,
          mensagem: erro instanceof Error ? erro.message : String(erro),
        });
      }
    }
    resultado.erros.sort((x, y) => x.linha - y.linha);

    return resultado;
  }

  /**
   * Exporta pendências da Plataforma para um arquivo TXT formatado em JSON Lines.
   */
  async exportarArquivo(empresaId: string): Promise<string> {
    const pendentesOrc = await this.orcamentosService.findAllPendentes(empresaId, {
      page: 1,
      pageSize: 500,
      sortOrder: 'asc',
    });
    const clientesRes = await this.clientesService.findAll(empresaId, {
      page: 1,
      pageSize: 500,
      sortOrder: 'asc',
    });

    const linhas: string[] = [];

    const orcData = pendentesOrc?.data ?? [];
    for (const orc of orcData) {
      linhas.push(
        JSON.stringify({
          entidade: 'orcamentos-pendentes',
          verbo: 'POST',
          chave: (orc as any).id || (orc as any).chave,
          payload: orc,
        }),
      );
    }

    const cliData = clientesRes?.data ?? [];
    for (const cli of cliData) {
      linhas.push(
        JSON.stringify({
          entidade: 'clientes-alteracoes',
          verbo: 'POST',
          chave: (cli as any).chave || (cli as any).id,
          payload: cli,
        }),
      );
    }

    return linhas.join('\n');
  }

  /** O nome da entidade como o monitor de endpoints a conhece. */
  private nomeDaEntidade(entidade: string): string {
    const nome = entidade.toLowerCase();
    return nome === 'condicoes-pagto' ? 'condicoes-pagamento' : nome;
  }

  private async processarItem(
    empresaId: string,
    apiKeyId: string,
    item: ItemArquivoImportacao,
  ): Promise<'criado' | 'atualizado' | 'excluido'> {
    const verbo = (item.verbo || 'POST').toUpperCase();
    const entidade = item.entidade.toLowerCase();
    const isDelete = verbo === 'DELETE';

    const execUpsert = async (service: any, payload: any) => {
      // O mesmo schema do `PUT` e da carga por arquivo: o payload deste
      // arquivo não passa por pipe de validação nenhum, e sem isto entrava
      // como veio.
      const nome = this.nomeDaEntidade(item.entidade) as IntegracaoCargaEntidade;
      if (!(INTEGRACAO_CARGA_ENTIDADES as readonly string[]).includes(nome)) {
        throw new BadRequestException(`Entidade '${item.entidade}' não é suportada para importação.`);
      }
      const conferido = this.entidades.de(nome).schema.safeParse(payload);
      if (!conferido.success) {
        throw new BadRequestException(
          conferido.error.issues
            .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
            .join('; ')
            .slice(0, 500),
        );
      }
      const { decisao } = await service.upsert(empresaId, apiKeyId, conferido.data);
      return decisao === 'criar' ? 'criado' : 'atualizado';
    };

    switch (entidade) {
      case 'produtos':
        if (isDelete) {
          await this.produtosService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.produtosService, item.payload);

      case 'clientes':
        if (isDelete) {
          await this.clientesService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.clientesService, item.payload);

      case 'vendedores':
        if (isDelete) {
          await this.vendedoresService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.vendedoresService, item.payload);

      case 'categorias':
        if (isDelete) {
          await this.categoriasService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.categoriasService, item.payload);

      case 'regras-desconto':
        if (isDelete) {
          await this.regrasDescontoService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.regrasDescontoService, item.payload);

      case 'condicoes-pagto':
      case 'condicoes-pagamento':
        if (isDelete) {
          await this.condicoesPagtoService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.condicoesPagtoService, item.payload);

      case 'armazens':
        if (isDelete) {
          await this.armazensService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.armazensService, item.payload);

      case 'tabelas-preco':
        if (isDelete) {
          await this.tabelasPrecoService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.tabelasPrecoService, item.payload);

      case 'estoque':
        if (isDelete) {
          await this.estoqueService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.estoqueService, item.payload);

      case 'fornecedores':
        if (isDelete) {
          await this.fornecedoresService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.fornecedoresService, item.payload);

      case 'notas-saida':
        if (isDelete) {
          await this.notasSaidaService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.notasSaidaService, item.payload);

      case 'notas-entrada':
        if (isDelete) {
          await this.notasEntradaService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.notasEntradaService, item.payload);

      case 'titulos-receber':
        if (isDelete) {
          await this.titulosReceberService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.titulosReceberService, item.payload);

      case 'objetivos':
        if (isDelete) {
          await this.objetivosService.remove(empresaId, apiKeyId, item.chave);
          return 'excluido';
        }
        return execUpsert(this.objetivosService, item.payload);

      default:
        throw new BadRequestException(`Entidade '${item.entidade}' não é suportada para importação.`);
    }
  }
}
