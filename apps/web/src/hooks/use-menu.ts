"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import {
  ROTINAS_DEPENDENTES_WHATSAPP,
  useWhatsappIntegracao,
} from "@/hooks/use-whatsapp-integracao";

export interface MenuItem {
  id: string;
  nome: string;
  icone?: string | null;
  rota?: string | null;
  ordem: number;
  disponivelTelaPequena: boolean;
  rotinas: { id: string; codigo: string; nome: string; disponivelTelaPequena: boolean }[];
}

export interface ModuloComMenus {
  id: string;
  nome: string;
  icone?: string | null;
  ordem: number;
  disponivelTelaPequena: boolean;
  menus: MenuItem[];
}

/**
 * Menu lateral filtrado pelas permissões (`<rotinaCodigo>.visualizar`) da
 * empresa ativa. Um menu só aparece se pelo menos uma das rotinas que ele
 * agrupa for visível ao usuário; um módulo só aparece se sobrar algum menu.
 * O perfil Admin (sistemaBase) recebe todas as permissões no seed, então
 * naturalmente enxerga tudo sem tratamento especial aqui.
 *
 * Rotinas que dependem de uma integração externa (ver
 * `ROTINAS_DEPENDENTES_WHATSAPP`) somem enquanto a integração está desligada,
 * mesmo para quem tem a permissão: o item levaria a uma tela sem serventia.
 */
/**
 * Módulo da administração do SaaS, montado no cliente em vez de vir de
 * `/modulos`.
 *
 * Não dá para ele nascer do catálogo como os outros: lá a visibilidade sai de
 * `<rotina>.visualizar`, permissão vive em perfil, e **perfis são globais** —
 * compartilhados por todas as empresas. Conceder a rotina ao Administrador a
 * daria a todo administrador de tenant, que é exatamente quem este módulo
 * precisa manter de fora. O corte aqui é o atributo `administradorPlataforma`
 * do usuário, o mesmo que a API confere no `PlatformAdminGuard`.
 *
 * Isto é conveniência de navegação, não controle de acesso: quem digitar a URL
 * à mão continua batendo no 403 da API.
 */
const MODULO_PLATAFORMA: ModuloComMenus = {
  id: "plataforma",
  nome: "Plataforma",
  icone: "shield",
  // Depois de Administração (1) e antes de Comercial (2), porque quem
  // administra o SaaS entra por aqui.
  ordem: 0,
  disponivelTelaPequena: false,
  menus: [
    {
      id: "plataforma-empresas",
      nome: "Empresas",
      icone: "building-2",
      rota: "/plataforma/empresas",
      ordem: 1,
      disponivelTelaPequena: false,
      rotinas: [],
    },
    {
      id: "plataforma-admins",
      nome: "Administradores",
      icone: "user-cog",
      rota: "/plataforma/admins",
      ordem: 2,
      disponivelTelaPequena: false,
      rotinas: [],
    },
    {
      id: "plataforma-auditoria",
      nome: "Registro de alterações",
      icone: "scroll-text",
      rota: "/plataforma/auditoria",
      ordem: 3,
      disponivelTelaPequena: false,
      rotinas: [],
    },
    {
      id: "plataforma-erros",
      nome: "Erros",
      icone: "bug",
      rota: "/plataforma/erros",
      ordem: 4,
      disponivelTelaPequena: false,
      rotinas: [],
    },
  ],
};

export function useMenu() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const permissoes = useAuthStore((s) => s.user?.permissoes);
  const administradorPlataforma = useAuthStore(
    (s) => s.user?.administradorPlataforma,
  );
  const { ativo: whatsappAtivo } = useWhatsappIntegracao();

  const query = useQuery({
    queryKey: ["modulos"],
    queryFn: () => apiFetch<ModuloComMenus[]>("/modulos"),
    enabled: !!accessToken,
    staleTime: 5 * 60_000,
  });

  const data = useMemo(() => {
    if (!query.data || !permissoes) return query.data;
    const podeVer = (codigo: string) =>
      permissoes.includes(`${codigo}.visualizar`) &&
      (whatsappAtivo === true ||
        !ROTINAS_DEPENDENTES_WHATSAPP.includes(codigo));

    const doCatalogo = query.data
      .map((modulo) => ({
        ...modulo,
        menus: modulo.menus
          .map((menu) => ({
            ...menu,
            rotinas: (menu.rotinas ?? []).filter((rotina) => podeVer(rotina.codigo)),
          }))
          .filter((menu) => menu.rotinas.length > 0),
      }))
      .filter((modulo) => modulo.menus.length > 0);

    // O módulo da plataforma não passa pelo filtro de permissão acima porque
    // não tem rotinas — ver o comentário em MODULO_PLATAFORMA.
    return administradorPlataforma
      ? [MODULO_PLATAFORMA, ...doCatalogo]
      : doCatalogo;
  }, [query.data, permissoes, whatsappAtivo, administradorPlataforma]);

  return { ...query, data };
}
