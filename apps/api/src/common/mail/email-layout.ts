import { NotFoundException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { PrismaService } from '../prisma/prisma.service';
import { escapeHtml } from '../html/escape-html';
import { LOGOS_DIR } from '../uploads/uploads.config';

/**
 * Layout dos e-mails da plataforma comercial:
 * - Cabeçalho institucional com cor da marca e logo embutido (CID inline).
 * - Tipografia limpa e cards estruturados para documentos e tabelas.
 * - Assinatura profissional do colaborador com canal direto.
 * - Rodapé com dados cadastrais e barra de acento.
 */

export type EmpresaDoEmail = {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  alias: string | null;
  logoUrl?: string | null;
  bannerCor?: string | null;
  endereco?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefone?: string | null;
  email?: string | null;
  site?: string | null;
};

export type RemetenteEmail = {
  nome: string;
  cargo?: string | null;
  email?: string | null;
  telefone?: string | null;
};

export type LayoutEmailOpcoes = {
  remetente?: RemetenteEmail | null;
  corCabecalho?: string | null;
  badgeTitulo?: string | null;
  temLogo?: boolean;
};

export type LogoEmail = {
  nome: string;
  conteudo: Buffer;
  mime: string;
  cid: string;
};

const SELECT_EMPRESA = {
  nomeFantasia: true,
  razaoSocial: true,
  cnpj: true,
  alias: true,
  logoUrl: true,
  bannerCor: true,
  endereco: true,
  complemento: true,
  bairro: true,
  municipio: true,
  uf: true,
  cep: true,
  telefone: true,
  email: true,
  site: true,
} as const;

/**
 * Lê o logo da empresa no disco para anexar como imagem inline (CID).
 * Exibido sem bloqueios de segurança no Outlook e Gmail.
 */
export async function carregarLogoEmail(
  logoUrl: string | null | undefined,
): Promise<LogoEmail | null> {
  if (!logoUrl) return null;
  try {
    const arquivo = basename(logoUrl);
    if (!arquivo || arquivo.startsWith('.')) return null;

    const extensao = arquivo.slice(arquivo.lastIndexOf('.')).toLowerCase();
    const mime =
      extensao === '.png'
        ? 'image/png'
        : extensao === '.jpg' || extensao === '.jpeg'
          ? 'image/jpeg'
          : extensao === '.webp'
            ? 'image/webp'
            : null;
    if (!mime) return null;

    const conteudo = await readFile(join(LOGOS_DIR, arquivo));
    return {
      nome: arquivo,
      conteudo,
      mime,
      cid: 'logo-empresa',
    };
  } catch {
    return null;
  }
}

/**
 * Dados da empresa para o e-mail. A empresa não é tabela de tenant: lida fora
 * da transação.
 */
export async function buscarEmpresaDoEmail(
  prisma: PrismaService,
  empresaId: string,
): Promise<EmpresaDoEmail> {
  const empresa = await prisma.empresa.findFirst({
    where: { id: empresaId },
    select: SELECT_EMPRESA,
  });
  if (!empresa) throw new NotFoundException('Empresa não encontrada');
  return empresa;
}

export const documentoFormatado = (v: string) => {
  const d = v.replace(/\D/g, '');
  if (d.length === 14)
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11)
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v;
};

function rodapeDaEmpresa(e: EmpresaDoEmail): string {
  const endereco = [
    [e.endereco, e.complemento].filter(Boolean).join(' - '),
    e.bairro,
    [e.municipio, e.uf].filter(Boolean).join('/'),
    e.cep ? `CEP ${e.cep}` : null,
  ]
    .filter(Boolean)
    .join(' — ');

  const contato = [
    e.telefone ? `Tel.: ${e.telefone}` : null,
    e.email,
    e.site,
  ].filter(Boolean);

  const linhas = [
    `<strong style="color:#f8fafc">${escapeHtml(e.nomeFantasia)}</strong>`,
    `${escapeHtml(e.razaoSocial)} — CNPJ ${escapeHtml(documentoFormatado(e.cnpj))}`,
    endereco ? escapeHtml(endereco) : null,
    contato.length ? escapeHtml(contato.join(' · ')) : null,
  ].filter(Boolean);

  return linhas.join('<br>');
}

function cardAssinatura(remetente: RemetenteEmail): string {
  const contato = [
    remetente.telefone
      ? `Tel / WhatsApp: <strong>${escapeHtml(remetente.telefone)}</strong>`
      : null,
    remetente.email
      ? `<a href="mailto:${escapeHtml(remetente.email)}" style="color:#2563eb;text-decoration:none">${escapeHtml(remetente.email)}</a>`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b">Atenciosamente,</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:6px;padding:12px 16px">
        <div style="font-size:15px;font-weight:700;color:#0f172a">${escapeHtml(remetente.nome)}</div>
        ${remetente.cargo ? `<div style="font-size:13px;color:#475569;margin-top:2px">${escapeHtml(remetente.cargo)}</div>` : ''}
        ${contato ? `<div style="font-size:12px;color:#64748b;margin-top:6px">${contato}</div>` : ''}
      </div>
    </div>`;
}

/** Envolve o corpo no layout moderno da plataforma. */
export function layoutEmail(
  empresa: EmpresaDoEmail,
  corpo: string,
  opcoes?: LayoutEmailOpcoes,
): string {
  const corTopo = opcoes?.corCabecalho || empresa.bannerCor || '#0f172a';
  const temLogo = opcoes?.temLogo ?? Boolean(empresa.logoUrl);
  const remetente = opcoes?.remetente;

  const headerLogo = temLogo
    ? `<img src="cid:logo-empresa" alt="${escapeHtml(empresa.nomeFantasia)}" style="max-height:48px;max-width:220px;display:block;border:0" />`
    : `<span style="font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:-0.5px">${escapeHtml(empresa.nomeFantasia)}</span>`;

  const headerBadge = opcoes?.badgeTitulo
    ? `<div style="text-align:right"><span style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;color:#e2e8f0;background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:12px;display:inline-block">${escapeHtml(opcoes.badgeTitulo)}</span></div>`
    : '';

  const avisoEnvio = remetente
    ? `Enviado via CRM por <a href="https://www.bjsoft.com.br" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:none;font-weight:600">BJSoft</a> (${escapeHtml(remetente.nome)}).`
    : `Enviado via CRM por <a href="https://www.bjsoft.com.br" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;text-decoration:none;font-weight:600">BJSoft</a>.`;

  return `
  <div style="background-color:#f1f5f9;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <table cellpadding="0" cellspacing="0" border="0" style="max-width:620px;width:100%;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #cbd5e1;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05)">
      <!-- Cabeçalho de Marca -->
      <tr>
        <td style="background:${corTopo};padding:20px 24px">
          <table cellpadding="0" cellspacing="0" border="0" style="width:100%">
            <tr>
              <td style="vertical-align:middle">${headerLogo}</td>
              <td style="vertical-align:middle">${headerBadge}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Conteúdo -->
      <tr>
        <td style="padding:28px 24px;font-size:14px;color:#1e293b;line-height:1.6">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;color:#64748b;margin-bottom:12px">
            ${escapeHtml(empresa.nomeFantasia)}
          </div>
          ${corpo}
          ${remetente ? cardAssinatura(remetente) : ''}
        </td>
      </tr>

      <!-- Rodapé Institucional -->
      <tr>
        <td style="background:#0f172a;padding:20px 24px;font-size:11px;color:#94a3b8;line-height:1.5">
          <div>${rodapeDaEmpresa(empresa)}</div>
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid #1e293b;font-size:10px;color:#64748b">
            ${avisoEnvio}
          </div>
        </td>
      </tr>
    </table>
  </div>`;
}

