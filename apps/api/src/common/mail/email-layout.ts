import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { escapeHtml } from '../html/escape-html';

/**
 * Layout comum dos e-mails da plataforma: quem envia vai no rodapé, com os
 * dados do cadastro da empresa, e o aviso de que é automático. O e-mail de
 * senha e o de documentos usam o mesmo — o cliente reconhece de quem é.
 */

export type EmpresaDoEmail = {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  alias: string | null;
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

const SELECT_EMPRESA = {
  nomeFantasia: true,
  razaoSocial: true,
  cnpj: true,
  alias: true,
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
 * Dados da empresa para o e-mail. A empresa não é tabela de tenant: lida fora
 * da transação, como no PDF do orçamento.
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
    `<strong>${escapeHtml(e.nomeFantasia)}</strong>`,
    `${escapeHtml(e.razaoSocial)} — CNPJ ${escapeHtml(documentoFormatado(e.cnpj))}`,
    endereco ? escapeHtml(endereco) : null,
    contato.length ? escapeHtml(contato.join(' · ')) : null,
  ].filter(Boolean);
  return linhas.join('<br>');
}

/** Envolve o corpo (HTML já escapado por quem monta) no layout comum. */
export function layoutEmail(empresa: EmpresaDoEmail, corpo: string): string {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;max-width:640px">
    ${corpo}
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px">
    <p style="font-size:12px;color:#555;line-height:1.5">${rodapeDaEmpresa(empresa)}</p>
    <p style="font-size:11px;color:#888">E-mail automático — não responda esta mensagem.</p>
  </div>`;
}
