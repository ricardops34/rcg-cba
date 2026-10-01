import { escapeHtml } from '../html/escape-html';

/**
 * Substituição de tags dinâmicas em textos e assuntos de e-mails.
 * Suporta formatos com ou sem espaços: `{{cliente.nome}}`, `{{ cliente.nome }}`.
 */

export type TagsContextoEmail = {
  cliente?: {
    nome?: string | null;
    razaoSocial?: string | null;
    cnpj?: string | null;
  };
  empresa?: {
    nomeFantasia?: string | null;
    razaoSocial?: string | null;
    telefone?: string | null;
    email?: string | null;
  };
  colaborador?: {
    nome?: string | null;
    cargo?: string | null;
    telefone?: string | null;
    email?: string | null;
  };
  nota?: {
    numero?: string | number | null;
    serie?: string | null;
    chave?: string | null;
    emissao?: string | null;
  };
  boleto?: {
    numero?: string | null;
    vencimento?: string | null;
    valor?: string | null;
    linhaDigitavel?: string | null;
  };
  cobranca?: {
    quantidade?: number | string | null;
    total?: string | null;
  };
  link?: {
    acesso?: string | null;
  };
};

/** Substitui tags dinâmicas em uma string usando o mapa de contexto. */
export function substituirTags(
  template: string,
  contexto: TagsContextoEmail,
): string {
  if (!template) return '';

  const mapa: Record<string, string> = {
    'cliente.nome': contexto.cliente?.nome || contexto.cliente?.razaoSocial || '',
    'cliente.razaoSocial': contexto.cliente?.razaoSocial || contexto.cliente?.nome || '',
    'cliente.cnpj': contexto.cliente?.cnpj || '',

    'empresa.nomeFantasia': contexto.empresa?.nomeFantasia || '',
    'empresa.razaoSocial': contexto.empresa?.razaoSocial || '',
    'empresa.telefone': contexto.empresa?.telefone || '',
    'empresa.email': contexto.empresa?.email || '',

    'colaborador.nome': contexto.colaborador?.nome || '',
    'colaborador.cargo': contexto.colaborador?.cargo || '',
    'colaborador.telefone': contexto.colaborador?.telefone || '',
    'colaborador.email': contexto.colaborador?.email || '',

    'nota.numero': contexto.nota?.numero != null ? String(contexto.nota.numero) : '',
    'nota.serie': contexto.nota?.serie || '',
    'nota.chave': contexto.nota?.chave || '',
    'nota.emissao': contexto.nota?.emissao || '',

    'boleto.numero': contexto.boleto?.numero || '',
    'boleto.vencimento': contexto.boleto?.vencimento || '',
    'boleto.valor': contexto.boleto?.valor || '',
    'boleto.linhaDigitavel': contexto.boleto?.linhaDigitavel || '',

    'cobranca.quantidade':
      contexto.cobranca?.quantidade != null ? String(contexto.cobranca.quantidade) : '',
    'cobranca.total': contexto.cobranca?.total || '',

    'link.acesso': contexto.link?.acesso || '',
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, chave) => {
    return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : match;
  });
}

/**
 * Converte texto plano (com quebras de linha) em HTML seguro,
 * escapando entidades e preservando quebras de linha com <br />.
 */
export function formatarTextoHtml(texto: string): string {
  if (!texto) return '';
  return escapeHtml(texto).replace(/\r?\n/g, '<br />');
}
