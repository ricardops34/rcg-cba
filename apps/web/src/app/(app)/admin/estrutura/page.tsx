"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  menuCreateSchema,
  moduloCreateSchema,
  rotinaCreateSchema,
  type Menu,
  type MenuCreate,
  type Modulo,
  type ModuloCreate,
  type Rotina,
  type RotinaCreate,
} from "@plataforma/contracts";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { DynamicIcon } from "@/lib/dynamic-icon";
import { IconPicker } from "@/components/crud/icon-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChevronRight,
  CornerDownRight,
  FolderTree,
  GripVertical,
  ListTree,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Layers,
  Menu as MenuIcon,
} from "lucide-react";

/**
 * O menu como a árvore o entrega: com as rotinas e os submenus juntos.
 *
 * `ativo` e `ativoNaEmpresa` são dois liga/desliga distintos — o do catálogo
 * global (só administrador da plataforma) e o desta empresa (administrador
 * dela). Basta um deles estar desligado para o item sair do menu.
 */
interface MenuArvore extends Menu {
  rotinas: Rotina[];
  submenus: MenuArvore[];
  ativoNaEmpresa: boolean;
}

interface ModuloComMenus extends Modulo {
  menus: MenuArvore[];
  ativoNaEmpresa: boolean;
}

/** Menu e submenus achatados numa lista só — para contas e para os seletores. */
function achatarMenus(menus: MenuArvore[]): MenuArvore[] {
  return menus.flatMap((menu) => [menu, ...achatarMenus(menu.submenus ?? [])]);
}

export default function EstruturaPage() {
  const qc = useQueryClient();

  /**
   * O catálogo (criar, renomear, mover, excluir, ligar globalmente) é da
   * plataforma e vale para **todas** as empresas — a API recusa quem não é
   * administrador dela. Sem isto aqui, o administrador de uma empresa via os
   * controles, mexia e recebia "Apenas administradores da plataforma podem
   * alterar o catálogo global". O que ele pode é ligar e desligar na empresa
   * dele, e isso continua à mostra.
   */
  const podeCatalogo =
    useAuthStore((state) => state.user?.administradorPlataforma) ?? false;

  /**
   * Árvore de administração, não a do menu lateral (`/modulos`): esta inclui o
   * que está desligado, que é justamente o que precisa aparecer aqui para
   * poder ser religado.
   */
  const modulosQuery = useQuery({
    queryKey: ["estrutura-arvore"],
    queryFn: () => apiFetch<ModuloComMenus[]>("/estrutura/arvore"),
  });

  const modulos = useMemo(() => modulosQuery.data ?? [], [modulosQuery.data]);
  const menusAchatados = useMemo(
    () => modulos.flatMap((modulo) => achatarMenus(modulo.menus)),
    [modulos],
  );

  const totalModulos = modulos.length;
  const totalMenus = menusAchatados.length;
  const totalRotinas = menusAchatados.reduce((acc, menu) => acc + menu.rotinas.length, 0);

  // A barra lateral e a busca global leem `/modulos`, então toda mudança aqui
  // precisa invalidar as duas caches — senão o menu do próprio administrador
  // fica mostrando o que ele acabou de desligar.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["estrutura-arvore"] });
    qc.invalidateQueries({ queryKey: ["modulos"] });
  };

  const createModulo = useMutation({
    mutationFn: (input: ModuloCreate) => apiFetch("/modulos", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
  const updateModulo = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ModuloCreate> }) =>
      apiFetch(`/modulos/${id}`, { method: "PATCH", body: input }),
  });
  const removeModulo = useMutation({
    mutationFn: (id: string) => apiFetch(`/modulos/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const createMenu = useMutation({
    mutationFn: (input: MenuCreate) => apiFetch("/menus", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
  const updateMenu = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MenuCreate> }) =>
      apiFetch(`/menus/${id}`, { method: "PATCH", body: input }),
  });
  const removeMenu = useMutation({
    mutationFn: (id: string) => apiFetch(`/menus/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const createRotina = useMutation({
    mutationFn: (input: RotinaCreate) => apiFetch("/rotinas", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
  const updateRotina = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RotinaCreate> }) =>
      apiFetch(`/rotinas/${id}`, { method: "PATCH", body: input }),
  });
  const removeRotina = useMutation({
    mutationFn: (id: string) => apiFetch(`/rotinas/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const salvarOrdem = (
    promessas: Promise<unknown>[],
    erro: string,
  ) =>
    Promise.all(promessas)
      .then(invalidate)
      .catch(() => {
        toast.error(erro);
        invalidate();
      });

  /**
   * Um `DndContext` só para módulos e menus. Eram dois (um por módulo), e por
   * isso o menu só se movia dentro do próprio módulo: para soltá-lo em outro,
   * os dois precisam estar sob o mesmo contexto. Quem é quem vem do
   * `data.tipo` que cada linha arrastável declara.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const tipoArrastado = active.data.current?.tipo;
    const tipoDestino = over.data.current?.tipo;

    if (tipoArrastado === "modulo") {
      if (tipoDestino !== "modulo") return;
      const oldIndex = modulos.findIndex((m) => m.id === active.id);
      const newIndex = modulos.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordenados = arrayMove(modulos, oldIndex, newIndex);
      qc.setQueryData(["estrutura-arvore"], reordenados);
      salvarOrdem(
        reordenados.map((m, i) => updateModulo.mutateAsync({ id: m.id, input: { ordem: i } })),
        "Erro ao salvar nova ordem dos módulos",
      );
      return;
    }

    if (tipoArrastado !== "menu") return;

    const moduloOrigemId = active.data.current?.moduloId as string | undefined;
    // Soltar sobre outro menu leva ao módulo daquele menu; soltar sobre o
    // cabeçalho de um módulo leva para o fim da lista dele.
    const moduloDestinoId =
      tipoDestino === "menu"
        ? (over.data.current?.moduloId as string | undefined)
        : tipoDestino === "modulo"
          ? (over.id as string)
          : undefined;
    if (!moduloOrigemId || !moduloDestinoId) return;

    const origem = modulos.find((m) => m.id === moduloOrigemId);
    const destino = modulos.find((m) => m.id === moduloDestinoId);
    if (!origem || !destino) return;

    if (moduloOrigemId === moduloDestinoId) {
      const oldIndex = origem.menus.findIndex((m) => m.id === active.id);
      const newIndex = origem.menus.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordenados = arrayMove(origem.menus, oldIndex, newIndex);
      qc.setQueryData<ModuloComMenus[]>(["estrutura-arvore"], (old) =>
        old?.map((m) => (m.id === origem.id ? { ...m, menus: reordenados } : m)),
      );
      salvarOrdem(
        reordenados.map((m, i) => updateMenu.mutateAsync({ id: m.id, input: { ordem: i } })),
        "Erro ao salvar nova ordem dos menus",
      );
      return;
    }

    const menu = origem.menus.find((m) => m.id === active.id);
    if (!menu) return;

    // Entra no fim do destino: a ordem que ele tinha é do módulo de origem e
    // cairia num ponto qualquer da lista de lá. O menu pai também fica para
    // trás — ele pertence à árvore do módulo antigo.
    updateMenu
      .mutateAsync({
        id: menu.id,
        input: {
          moduloId: moduloDestinoId,
          menuPaiId: null,
          ordem: Math.max(0, ...destino.menus.map((m) => m.ordem)) + 1,
        },
      })
      .then(() => {
        invalidate();
        toast.success(`"${menu.nome}" movido para ${destino.nome}`);
      })
      .catch((err) => {
        toast.error(err instanceof ApiError ? err.message : "Erro ao mover o menu");
        invalidate();
      });
  };

  const toggleModuloEmpresa = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      apiFetch(`/estrutura/empresa/modulos/${id}`, { method: "PATCH", body: { ativo } }),
  });
  const toggleMenuEmpresa = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      apiFetch(`/estrutura/empresa/menus/${id}`, { method: "PATCH", body: { ativo } }),
  });

  /** Liga/desliga desta empresa — não encosta no catálogo. */
  const alternarNaEmpresa = (
    tipo: "modulo" | "menu",
    id: string,
    nome: string,
    ativo: boolean,
  ) => {
    const mutation = tipo === "modulo" ? toggleModuloEmpresa : toggleMenuEmpresa;
    return mutation
      .mutateAsync({ id, ativo })
      .then(() => {
        invalidate();
        toast.success(
          ativo ? `"${nome}" ligado nesta empresa` : `"${nome}" desligado nesta empresa`,
        );
      })
      .catch((err: unknown) =>
        toast.error(err instanceof ApiError ? err.message : "Erro ao alterar o estado"),
      );
  };

  const alternarAtivo = (
    tipo: "modulo" | "menu" | "rotina",
    id: string,
    nome: string,
    ativo: boolean,
  ) => {
    const mutation =
      tipo === "modulo" ? updateModulo : tipo === "menu" ? updateMenu : updateRotina;
    return mutation
      .mutateAsync({ id, input: { ativo } })
      .then(() => {
        invalidate();
        toast.success(ativo ? `"${nome}" ligado` : `"${nome}" desligado`);
      })
      .catch((err: unknown) =>
        toast.error(err instanceof ApiError ? err.message : "Erro ao alterar o estado"),
      );
  };

  const [moduloDialog, setModuloDialog] = useState<{ editing: Modulo | null } | null>(null);
  const [menuDialog, setMenuDialog] = useState<{
    moduloId: string;
    editing: MenuArvore | null;
    /** Preenchido quando o diálogo nasceu de "Novo submenu". */
    menuPaiId?: string | null;
  } | null>(null);
  const [rotinaDialog, setRotinaDialog] = useState<{ menuId: string; editing: Rotina | null } | null>(
    null,
  );

  return (
    <div className="space-y-6">
      {/* Superior Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <FolderTree className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Estrutura de Menu e Rotinas</h1>
              <Badge variant="outline" className="text-xs">Navegação & RBAC</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {podeCatalogo
                ? "Módulos agrupam menus e rotinas de permissão do sistema. Arraste (⋮⋮) para reordenar ou para levar um menu de um módulo a outro."
                : "Ligue ou desligue aqui os módulos e as telas que esta empresa usa."}
            </p>
          </div>
        </div>
        {podeCatalogo && (
          <Button onClick={() => setModuloDialog({ editing: null })} className="gap-2 shadow-xs">
            <Plus className="size-4" /> Novo módulo
          </Button>
        )}
      </div>

      {!podeCatalogo && (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          O <strong>catálogo</strong> (criar, renomear, mover e excluir módulos, menus e rotinas) é
          da plataforma e vale para todos os clientes, por isso não aparece aqui. O que você liga e
          desliga nesta tela vale <strong>só para esta empresa</strong>.
        </p>
      )}

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total de Módulos</p>
              <p className="text-2xl font-bold tracking-tight mt-1">{totalModulos}</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total de Menus</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-blue-600 dark:text-blue-400">
                {totalMenus}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <MenuIcon className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Rotinas Mapeadas</p>
              <p className="text-2xl font-bold tracking-tight mt-1 text-purple-600 dark:text-purple-400">
                {totalRotinas}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
              <ListTree className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {modulosQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={modulos.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {modulos.map((modulo) => (
              <ModuloRow
                key={modulo.id}
                modulo={modulo}
                podeCatalogo={podeCatalogo}
                onToggleEmpresaModulo={(value) =>
                  alternarNaEmpresa("modulo", modulo.id, modulo.nome, value)
                }
                onToggleEmpresaMenu={(menu, value) =>
                  alternarNaEmpresa("menu", menu.id, menu.nome, value)
                }
                onEditModulo={() => setModuloDialog({ editing: modulo })}
                onToggleAtivoModulo={(value) =>
                  alternarAtivo("modulo", modulo.id, modulo.nome, value)
                }
                onToggleTelaPequenaModulo={(value) =>
                  updateModulo.mutateAsync({ id: modulo.id, input: { disponivelTelaPequena: value } })
                    .then(() => { invalidate(); toast.success(value ? "Módulo liberado no celular" : "Módulo bloqueado no celular"); })
                    .catch((err) => toast.error(err instanceof ApiError ? err.message : "Erro ao alterar módulo"))
                }
                onDeleteModulo={async () => {
                  if (!confirm(`Excluir o módulo "${modulo.nome}"?`)) return;
                  try {
                    await removeModulo.mutateAsync(modulo.id);
                    toast.success("Módulo excluído");
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : "Erro ao excluir módulo");
                  }
                }}
                onCreateMenu={() => setMenuDialog({ moduloId: modulo.id, editing: null })}
                onEditMenu={(menu) => setMenuDialog({ moduloId: modulo.id, editing: menu })}
                onToggleAtivoMenu={(menu, value) =>
                  alternarAtivo("menu", menu.id, menu.nome, value)
                }
                onToggleTelaPequenaMenu={(menu, value) =>
                  updateMenu.mutateAsync({ id: menu.id, input: { disponivelTelaPequena: value } })
                    .then(() => { invalidate(); toast.success(value ? "Tela liberada no celular" : "Tela bloqueada no celular"); })
                    .catch((err) => toast.error(err instanceof ApiError ? err.message : "Erro ao alterar menu"))
                }
                onDeleteMenu={async (menu) => {
                  if (!confirm(`Excluir o menu "${menu.nome}"?`)) return;
                  try {
                    await removeMenu.mutateAsync(menu.id);
                    toast.success("Menu excluído");
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : "Erro ao excluir menu");
                  }
                }}
                onCreateSubmenu={(menu) =>
                  setMenuDialog({ moduloId: modulo.id, editing: null, menuPaiId: menu.id })
                }
                onCreateRotina={(menu) => setRotinaDialog({ menuId: menu.id, editing: null })}
                onEditRotina={(menu, rotina) => setRotinaDialog({ menuId: menu.id, editing: rotina })}
                onToggleAtivoRotina={(rotina, value) =>
                  alternarAtivo("rotina", rotina.id, rotina.nome, value)
                }
                onToggleTelaPequenaRotina={(rotina, value) =>
                  updateRotina.mutateAsync({ id: rotina.id, input: { disponivelTelaPequena: value } })
                    .then(() => { invalidate(); toast.success(value ? "Rotina liberada no celular" : "Rotina bloqueada no celular"); })
                    .catch((err) => toast.error(err instanceof ApiError ? err.message : "Erro ao alterar rotina"))
                }
                onDeleteRotina={async (rotina) => {
                  if (!confirm(`Excluir a rotina "${rotina.nome}"?`)) return;
                  try {
                    await removeRotina.mutateAsync(rotina.id);
                    toast.success("Rotina excluída");
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : "Erro ao excluir rotina");
                  }
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!modulosQuery.isLoading && modulos.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-muted-foreground">
          <FolderTree className="size-6" />
          <p className="text-sm">Nenhum módulo cadastrado ainda.</p>
        </div>
      )}

      {moduloDialog && (
        <ModuloFormDialog
          editing={moduloDialog.editing}
          onClose={() => setModuloDialog(null)}
          onCreate={(input) => createModulo.mutateAsync(input)}
          onUpdate={(id, input) => updateModulo.mutateAsync({ id, input }).then(invalidate)}
        />
      )}

      {menuDialog && (
        <MenuFormDialog
          moduloId={menuDialog.moduloId}
          modulos={modulos}
          editing={menuDialog.editing}
          menuPaiInicial={menuDialog.menuPaiId ?? null}
          onClose={() => setMenuDialog(null)}
          onCreate={(input) => createMenu.mutateAsync(input)}
          onUpdate={(id, input) => updateMenu.mutateAsync({ id, input }).then(invalidate)}
        />
      )}

      {rotinaDialog && (
        <RotinaFormDialog
          menuId={rotinaDialog.menuId}
          modulos={modulos}
          editing={rotinaDialog.editing}
          onClose={() => setRotinaDialog(null)}
          onCreate={(input) => createRotina.mutateAsync(input)}
          onUpdate={(id, input) => updateRotina.mutateAsync({ id, input }).then(invalidate)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Linhas arrastáveis
// -----------------------------------------------------------------------

function ModuloRow({
  modulo,
  podeCatalogo,
  onToggleEmpresaModulo,
  onToggleEmpresaMenu,
  onEditModulo,
  onToggleAtivoModulo,
  onToggleTelaPequenaModulo,
  onDeleteModulo,
  onCreateMenu,
  onEditMenu,
  onToggleAtivoMenu,
  onToggleTelaPequenaMenu,
  onDeleteMenu,
  onCreateSubmenu,
  onCreateRotina,
  onEditRotina,
  onToggleAtivoRotina,
  onToggleTelaPequenaRotina,
  onDeleteRotina,
}: {
  modulo: ModuloComMenus;
  podeCatalogo: boolean;
  onToggleEmpresaModulo: (value: boolean) => void;
  onToggleEmpresaMenu: (menu: MenuArvore, value: boolean) => void;
  onEditModulo: () => void;
  onToggleAtivoModulo: (value: boolean) => void;
  onToggleTelaPequenaModulo: (value: boolean) => void;
  onDeleteModulo: () => void;
  onCreateMenu: () => void;
  onEditMenu: (menu: MenuArvore) => void;
  onToggleAtivoMenu: (menu: MenuArvore, value: boolean) => void;
  onToggleTelaPequenaMenu: (menu: MenuArvore, value: boolean) => void;
  onDeleteMenu: (menu: MenuArvore) => void;
  onCreateSubmenu: (menu: MenuArvore) => void;
  onCreateRotina: (menu: MenuArvore) => void;
  onEditRotina: (menu: MenuArvore, rotina: Rotina) => void;
  onToggleAtivoRotina: (rotina: Rotina, value: boolean) => void;
  onToggleTelaPequenaRotina: (rotina: Rotina, value: boolean) => void;
  onDeleteRotina: (rotina: Rotina) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: modulo.id,
    data: { tipo: "modulo" },
  });

  return (
    <Collapsible
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      defaultOpen
      className="overflow-hidden rounded-2xl border border-border/70 bg-card data-[desligado]:border-dashed"
      data-dragging={isDragging || undefined}
      data-desligado={!modulo.ativo || undefined}
    >
      <div className="flex items-center gap-1 px-2 py-3 data-[dragging]:opacity-50">
        {podeCatalogo ? (
          <button
            type="button"
            className="cursor-grab touch-none rounded p-1.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : (
          <span className="w-7" />
        )}

        <CollapsibleTrigger asChild>
          <button className="group flex flex-1 items-center gap-3 text-left">
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <div
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                modulo.ativo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <DynamicIcon name={modulo.icone} className="size-4" />
            </div>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", !modulo.ativo && "text-muted-foreground")}>
                {modulo.nome}
              </p>
              <p className="text-xs text-muted-foreground">
                {modulo.menus.length} {modulo.menus.length === 1 ? "menu" : "menus"}
              </p>
            </div>
          </button>
        </CollapsibleTrigger>

        <div className="flex shrink-0 items-center gap-2">
          {!modulo.ativo && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Desligado na plataforma
            </Badge>
          )}
          {/* O switch da linha é o da EMPRESA: é a decisão do dia a dia, e a
              única que o administrador de empresa pode tomar. O liga/desliga
              global fica escrito por extenso no menu "…". */}
          <SwitchDeLinha
            rotulo="Ativo"
            checked={modulo.ativoNaEmpresa}
            label={`Ligar ou desligar o módulo ${modulo.nome} nesta empresa`}
            onCheckedChange={onToggleEmpresaModulo}
          />
          {podeCatalogo && (
            <>
              <Button variant="outline" size="sm" onClick={onCreateMenu}>
                <Plus className="size-3.5" />
                Menu
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEditModulo}>
                    <Pencil className="size-4" /> Editar módulo
                  </DropdownMenuItem>
                  <DropdownMenuCheckboxItem
                    checked={modulo.ativo}
                    onCheckedChange={onToggleAtivoModulo}
                    onSelect={(event) => event.preventDefault()}
                  >
                    Ativo na plataforma inteira
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={modulo.disponivelTelaPequena}
                    onCheckedChange={onToggleTelaPequenaModulo}
                    onSelect={(event) => event.preventDefault()}
                  >
                    Disponível no celular
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDeleteModulo}>
                    <Trash2 className="size-4" /> Excluir módulo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {(!modulo.ativo || !modulo.ativoNaEmpresa) && (
        <p className="border-t border-border/60 bg-muted/40 px-4 py-2 pl-14 text-xs text-muted-foreground">
          {!modulo.ativo
            ? "Desligado no catálogo da plataforma: some para todas as empresas."
            : "Desligado nesta empresa."}{" "}
          Os menus e rotinas abaixo saem do menu lateral e a API recusa o acesso a eles — sem perder
          nada do que está configurado aqui. Religue para voltar ao que era.
        </p>
      )}

      <CollapsibleContent>
        <div className="divide-y divide-border/60 border-t border-border/60">
          {modulo.menus.length === 0 && (
            <p className="px-4 py-4 pl-14 text-sm text-muted-foreground">
              Nenhum menu neste módulo ainda.
            </p>
          )}

          <SortableContext
            items={modulo.menus.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            {modulo.menus.map((menu) => (
              <MenuRow
                key={menu.id}
                menu={menu}
                moduloId={modulo.id}
                moduloAtivo={modulo.ativo && modulo.ativoNaEmpresa}
                podeCatalogo={podeCatalogo}
                onToggleEmpresa={(value) => onToggleEmpresaMenu(menu, value)}
                onToggleEmpresaSubmenu={onToggleEmpresaMenu}
                onEdit={() => onEditMenu(menu)}
                onToggleAtivo={(value) => onToggleAtivoMenu(menu, value)}
                onToggleTelaPequena={(value) => onToggleTelaPequenaMenu(menu, value)}
                onDelete={() => onDeleteMenu(menu)}
                onCreateSubmenu={() => onCreateSubmenu(menu)}
                onCreateRotina={() => onCreateRotina(menu)}
                onEditRotina={(rotina) => onEditRotina(menu, rotina)}
                onToggleAtivoRotina={onToggleAtivoRotina}
                onToggleTelaPequenaRotina={onToggleTelaPequenaRotina}
                onDeleteRotina={onDeleteRotina}
                onEditSubmenu={onEditMenu}
                onToggleAtivoSubmenu={onToggleAtivoMenu}
                onToggleTelaPequenaSubmenu={onToggleTelaPequenaMenu}
                onDeleteSubmenu={onDeleteMenu}
                onCreateRotinaSubmenu={onCreateRotina}
                onEditRotinaSubmenu={onEditRotina}
              />
            ))}
          </SortableContext>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MenuRow({
  menu,
  moduloId,
  moduloAtivo,
  podeCatalogo,
  nivel = 0,
  onToggleEmpresa,
  onToggleEmpresaSubmenu,
  onEdit,
  onToggleAtivo,
  onToggleTelaPequena,
  onDelete,
  onCreateSubmenu,
  onCreateRotina,
  onEditRotina,
  onToggleAtivoRotina,
  onToggleTelaPequenaRotina,
  onDeleteRotina,
  onEditSubmenu,
  onToggleAtivoSubmenu,
  onToggleTelaPequenaSubmenu,
  onDeleteSubmenu,
  onCreateRotinaSubmenu,
  onEditRotinaSubmenu,
}: {
  menu: MenuArvore;
  moduloId: string;
  moduloAtivo: boolean;
  podeCatalogo: boolean;
  nivel?: number;
  onToggleEmpresa: (value: boolean) => void;
  onToggleEmpresaSubmenu?: (menu: MenuArvore, value: boolean) => void;
  onEdit: () => void;
  onToggleAtivo: (value: boolean) => void;
  onToggleTelaPequena: (value: boolean) => void;
  onDelete: () => void;
  onCreateSubmenu?: () => void;
  onCreateRotina: () => void;
  onEditRotina: (rotina: Rotina) => void;
  onToggleAtivoRotina: (rotina: Rotina, value: boolean) => void;
  onToggleTelaPequenaRotina: (rotina: Rotina, value: boolean) => void;
  onDeleteRotina: (rotina: Rotina) => void;
  onEditSubmenu?: (menu: MenuArvore) => void;
  onToggleAtivoSubmenu?: (menu: MenuArvore, value: boolean) => void;
  onToggleTelaPequenaSubmenu?: (menu: MenuArvore, value: boolean) => void;
  onDeleteSubmenu?: (menu: MenuArvore) => void;
  onCreateRotinaSubmenu?: (menu: MenuArvore) => void;
  onEditRotinaSubmenu?: (menu: MenuArvore, rotina: Rotina) => void;
}) {
  // Só o primeiro nível é arrastável: é ele que troca de posição e de módulo.
  // Submenu muda de lugar pelo diálogo, onde se escolhe o menu pai.
  const sortable = useSortable({
    id: menu.id,
    data: { tipo: "menu", moduloId },
    disabled: nivel > 0,
  });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const submenus = menu.submenus ?? [];
  const desligadoPorCima = !moduloAtivo;

  return (
    <Collapsible
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(nivel === 0 ? "bg-muted/20" : "bg-muted/10")}
      data-dragging={isDragging || undefined}
    >
      <div
        className={cn(
          "flex items-center gap-1 py-2.5 pr-4 data-[dragging]:opacity-50",
          nivel === 0 ? "pl-10" : "pl-16",
        )}
      >
        {nivel === 0 && podeCatalogo ? (
          <button
            type="button"
            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : nivel === 0 ? (
          <span className="w-6" />
        ) : (
          <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/60" />
        )}

        <CollapsibleTrigger asChild>
          <button className="group flex flex-1 items-center gap-2.5 text-left">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <DynamicIcon name={menu.icone} className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  (!menu.ativo || desligadoPorCima) && "text-muted-foreground",
                )}
              >
                {menu.nome}
              </p>
              {menu.rota && (
                <p className="truncate font-mono text-xs text-muted-foreground">{menu.rota}</p>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <div className="flex shrink-0 items-center gap-2">
          {!menu.ativo && (
            <Badge variant="secondary" className="hidden xl:inline-flex">
              Desligado na plataforma
            </Badge>
          )}
          <Badge variant="outline">
            {menu.rotinas.length} {menu.rotinas.length === 1 ? "rotina" : "rotinas"}
          </Badge>
          <SwitchDeLinha
            rotulo="Ativo"
            checked={menu.ativoNaEmpresa}
            label={`Ligar ou desligar o menu ${menu.nome} nesta empresa`}
            onCheckedChange={onToggleEmpresa}
          />
          {podeCatalogo && (
            <>
              <Button variant="ghost" size="sm" onClick={onCreateRotina}>
                <Plus className="size-3.5" />
                Rotina
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="size-4" /> Editar menu
                  </DropdownMenuItem>
                  {nivel === 0 && onCreateSubmenu && (
                    <DropdownMenuItem onClick={onCreateSubmenu}>
                      <CornerDownRight className="size-4" /> Novo submenu
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuCheckboxItem
                    checked={menu.ativo}
                    onCheckedChange={onToggleAtivo}
                    onSelect={(event) => event.preventDefault()}
                  >
                    Ativo na plataforma inteira
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={menu.disponivelTelaPequena}
                    onCheckedChange={onToggleTelaPequena}
                    onSelect={(event) => event.preventDefault()}
                  >
                    Disponível no celular
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="size-4" /> Excluir menu
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <div
          className={cn("space-y-1 py-2 pr-4", nivel === 0 ? "pl-[4.75rem]" : "pl-[6.5rem]")}
        >
          {menu.rotinas.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma rotina neste menu ainda.</p>
          )}

          {menu.rotinas.map((rotina) => (
            <RotinaRow
              key={rotina.id}
              rotina={rotina}
              podeCatalogo={podeCatalogo}
              onEdit={() => onEditRotina(rotina)}
              onToggleAtivo={(value) => onToggleAtivoRotina(rotina, value)}
              onToggleTelaPequena={(value) => onToggleTelaPequenaRotina(rotina, value)}
              onDelete={() => onDeleteRotina(rotina)}
            />
          ))}
        </div>

        {submenus.length > 0 && (
          <div className="divide-y divide-border/60 border-t border-border/60">
            {submenus.map((submenu) => (
              <MenuRow
                key={submenu.id}
                menu={submenu}
                moduloId={moduloId}
                moduloAtivo={moduloAtivo && menu.ativo && menu.ativoNaEmpresa}
                podeCatalogo={podeCatalogo}
                nivel={nivel + 1}
                onToggleEmpresa={(value) => onToggleEmpresaSubmenu?.(submenu, value)}
                onToggleEmpresaSubmenu={onToggleEmpresaSubmenu}
                onEdit={() => onEditSubmenu?.(submenu)}
                onToggleAtivo={(value) => onToggleAtivoSubmenu?.(submenu, value)}
                onToggleTelaPequena={(value) => onToggleTelaPequenaSubmenu?.(submenu, value)}
                onDelete={() => onDeleteSubmenu?.(submenu)}
                onCreateRotina={() => onCreateRotinaSubmenu?.(submenu)}
                onEditRotina={(rotina) => onEditRotinaSubmenu?.(submenu, rotina)}
                onToggleAtivoRotina={onToggleAtivoRotina}
                onToggleTelaPequenaRotina={onToggleTelaPequenaRotina}
                onDeleteRotina={onDeleteRotina}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A rotina é o código de permissão da tela, e só existe no catálogo global —
 * não tem liga/desliga por empresa. Para quem administra uma empresa ela é
 * informação: o que se decide por empresa está um nível acima (o menu), e quem
 * pode ou não usá-la se resolve em Perfis.
 */
function RotinaRow({
  rotina,
  podeCatalogo,
  onEdit,
  onToggleAtivo,
  onToggleTelaPequena,
  onDelete,
}: {
  rotina: Rotina;
  podeCatalogo: boolean;
  onEdit: () => void;
  onToggleAtivo: (value: boolean) => void;
  onToggleTelaPequena: (value: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
      <div className="flex items-center gap-2 text-sm">
        <ListTree className="size-3.5 text-muted-foreground" />
        <span className={cn(!rotina.ativo && "text-muted-foreground")}>{rotina.nome}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {rotina.codigo}
        </code>
        {!rotina.ativo && !podeCatalogo && <Badge variant="secondary">Desligada</Badge>}
      </div>
      {podeCatalogo && (
        <div className="flex shrink-0 items-center gap-2">
          <SwitchDeLinha
            rotulo="Ativo"
            checked={rotina.ativo}
            label={`Ligar ou desligar a rotina ${rotina.nome} na plataforma inteira`}
            onCheckedChange={onToggleAtivo}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-4" /> Editar / mover
              </DropdownMenuItem>
              <DropdownMenuCheckboxItem
                checked={rotina.disponivelTelaPequena}
                onCheckedChange={onToggleTelaPequena}
                onSelect={(event) => event.preventDefault()}
              >
                Disponível no celular
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

/**
 * O switch de ligar/desligar da linha — **um só**, e sempre com o rótulo à
 * vista.
 *
 * Eram dois switches lado a lado (ativo e "tela pequena"), com o texto escondido
 * abaixo de `2xl`: na largura em que a tela costuma ser usada, viravam dois
 * controles idênticos e mudos. O que é raro de mexer (disponibilidade no
 * celular) foi para o menu "…" da linha, escrito por extenso.
 */
function SwitchDeLinha({
  rotulo,
  checked,
  label,
  onCheckedChange,
}: {
  rotulo: string;
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      title={label}
      onClick={(event) => event.stopPropagation()}
    >
      <span>{rotulo}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </label>
  );
}

// -----------------------------------------------------------------------
// Dialogs
// -----------------------------------------------------------------------

function ModuloFormDialog({
  editing,
  onClose,
  onCreate,
  onUpdate,
}: {
  editing: Modulo | null;
  onClose: () => void;
  onCreate: (input: ModuloCreate) => Promise<unknown>;
  onUpdate: (id: string, input: Partial<ModuloCreate>) => Promise<unknown>;
}) {
  const form = useForm<ModuloCreate>({
    resolver: zodResolver(moduloCreateSchema),
    defaultValues: {
      nome: editing?.nome ?? "",
      icone: editing?.icone ?? "",
      ordem: editing?.ordem ?? 0,
      ativo: editing?.ativo ?? true,
      disponivelTelaPequena: editing?.disponivelTelaPequena ?? true,
    },
  });

  const onSubmit = async (values: ModuloCreate) => {
    try {
      if (editing) {
        await onUpdate(editing.id, values);
        toast.success("Módulo atualizado");
      } else {
        await onCreate(values);
        toast.success("Módulo cadastrado");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar módulo");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar módulo" : "Novo módulo"}</DialogTitle>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field data-invalid={!!form.formState.errors.nome}>
              <FieldLabel htmlFor="nome">Nome</FieldLabel>
              <Input id="nome" {...form.register("nome")} />
              <FieldError errors={[form.formState.errors.nome]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="icone">Ícone</FieldLabel>
              <IconPicker
                value={form.watch("icone")}
                onChange={(v) => form.setValue("icone", v)}
              />
            </Field>
            <Field>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
                <span>
                  <span className="block text-sm font-medium">Módulo ativo</span>
                  <span className="block text-xs text-muted-foreground">
                    Desligado, o módulo inteiro sai do menu lateral e a API recusa suas rotinas.
                  </span>
                </span>
                <Switch
                  checked={form.watch("ativo")}
                  onCheckedChange={(value) => form.setValue("ativo", value, { shouldDirty: true })}
                />
              </label>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MenuFormDialog({
  moduloId,
  modulos,
  editing,
  menuPaiInicial,
  onClose,
  onCreate,
  onUpdate,
}: {
  moduloId: string;
  /** Todos os módulos com seus menus — destino possível e base do cálculo da ordem. */
  modulos: ModuloComMenus[];
  editing: MenuArvore | null;
  /** Preenchido quando o diálogo foi aberto por "Novo submenu". */
  menuPaiInicial?: string | null;
  onClose: () => void;
  onCreate: (input: MenuCreate) => Promise<unknown>;
  onUpdate: (id: string, input: Partial<MenuCreate>) => Promise<unknown>;
}) {
  const form = useForm<MenuCreate>({
    resolver: zodResolver(menuCreateSchema),
    defaultValues: {
      moduloId,
      menuPaiId: editing?.menuPaiId ?? menuPaiInicial ?? null,
      nome: editing?.nome ?? "",
      icone: editing?.icone ?? "",
      rota: editing?.rota ?? "",
      ordem: editing?.ordem ?? 0,
      ativo: editing?.ativo ?? true,
      disponivelTelaPequena: editing?.disponivelTelaPequena ?? true,
    },
  });
  const moduloSelecionado = form.watch("moduloId");
  const menuPaiSelecionado = form.watch("menuPaiId");

  // Pai possível: menu de primeiro nível do módulo escolhido, que não seja o
  // próprio menu. A API recusa o resto (neto, pai de outro módulo, ciclo).
  const paisPossiveis = (modulos.find((m) => m.id === moduloSelecionado)?.menus ?? []).filter(
    (m) => m.id !== editing?.id,
  );
  const temSubmenus = (editing?.submenus?.length ?? 0) > 0;

  const onSubmit = async (values: MenuCreate) => {
    // Mudou de módulo: entra no fim do destino (a ordem antiga é do módulo de
    // origem e cairia no meio da lista de lá) e larga o menu pai, que pertence
    // à árvore do módulo de origem.
    const trocouDeModulo = values.moduloId !== moduloId;
    const menusDoDestino = modulos.find((m) => m.id === values.moduloId)?.menus ?? [];
    const dados: MenuCreate = trocouDeModulo
      ? {
          ...values,
          menuPaiId: null,
          ordem: Math.max(0, ...menusDoDestino.map((m) => m.ordem)) + 1,
        }
      : values;

    try {
      if (editing) {
        await onUpdate(editing.id, dados);
        toast.success(trocouDeModulo ? "Menu movido de módulo" : "Menu atualizado");
      } else {
        await onCreate(dados);
        toast.success(dados.menuPaiId ? "Submenu cadastrado" : "Menu cadastrado");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar menu");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar menu" : "Novo menu"}</DialogTitle>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field data-invalid={!!form.formState.errors.nome}>
              <FieldLabel htmlFor="nome">Nome</FieldLabel>
              <Input id="nome" {...form.register("nome")} />
              <FieldError errors={[form.formState.errors.nome]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="moduloId">Módulo</FieldLabel>
              <Select
                value={moduloSelecionado}
                onValueChange={(v) => {
                  form.setValue("moduloId", v);
                  // O pai é do módulo antigo — segurá-lo aqui só geraria erro
                  // na API ("pai precisa estar no mesmo módulo").
                  form.setValue("menuPaiId", null);
                }}
              >
                <SelectTrigger id="moduloId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modulos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing && moduloSelecionado !== moduloId && (
                <FieldDescription>
                  Ao salvar, o menu vai para o fim da lista do módulo escolhido — a ordem dentro
                  dele pode ser ajustada arrastando.
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="menuPaiId">Dentro de</FieldLabel>
              <Select
                value={menuPaiSelecionado ?? "__raiz__"}
                onValueChange={(v) => form.setValue("menuPaiId", v === "__raiz__" ? null : v)}
                disabled={temSubmenus}
              >
                <SelectTrigger id="menuPaiId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__raiz__">O próprio módulo (primeiro nível)</SelectItem>
                  {paisPossiveis.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {temSubmenus
                  ? "Este menu já tem submenus, então ele próprio não pode virar submenu — a árvore tem dois níveis."
                  : "Escolher um menu aqui transforma este item em submenu dele."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="rota">Rota no sistema</FieldLabel>
              <Input id="rota" placeholder="/comercial/produtos" {...form.register("rota")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="icone">Ícone</FieldLabel>
              <IconPicker
                value={form.watch("icone")}
                onChange={(v) => form.setValue("icone", v)}
              />
            </Field>
            <Field>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
                <span>
                  <span className="block text-sm font-medium">Disponível em telas pequenas</span>
                  <span className="block text-xs text-muted-foreground">
                    Permite abrir esta rotina em celulares e telas menores que 768 px.
                  </span>
                </span>
                <Switch
                  checked={form.watch("disponivelTelaPequena")}
                  onCheckedChange={(value) =>
                    form.setValue("disponivelTelaPequena", value, { shouldDirty: true })
                  }
                />
              </label>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RotinaFormDialog({
  menuId,
  modulos,
  editing,
  onClose,
  onCreate,
  onUpdate,
}: {
  menuId: string;
  modulos: ModuloComMenus[];
  editing: Rotina | null;
  onClose: () => void;
  onCreate: (input: RotinaCreate) => Promise<unknown>;
  onUpdate: (id: string, input: Partial<RotinaCreate>) => Promise<unknown>;
}) {
  const form = useForm<RotinaCreate>({
    resolver: zodResolver(rotinaCreateSchema),
    defaultValues: {
      menuId,
      nome: editing?.nome ?? "",
      codigo: editing?.codigo ?? "",
      ativo: editing?.ativo ?? true,
      disponivelTelaPequena: editing?.disponivelTelaPequena ?? true,
    },
  });
  const menuSelecionado = form.watch("menuId");

  // Todos os menus de todos os módulos, com o nome do módulo à frente: mover a
  // rotina é escolher outro daqui.
  const destinos = modulos.flatMap((modulo) =>
    achatarMenus(modulo.menus).map((menu) => ({
      id: menu.id,
      rotulo: `${modulo.nome} › ${menu.nome}`,
    })),
  );

  const onSubmit = async (values: RotinaCreate) => {
    try {
      if (editing) {
        await onUpdate(editing.id, values);
        toast.success(values.menuId !== menuId ? "Rotina movida de menu" : "Rotina atualizada");
      } else {
        await onCreate(values);
        toast.success("Rotina cadastrada");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Erro ao salvar rotina");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar rotina" : "Nova rotina"}</DialogTitle>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field data-invalid={!!form.formState.errors.nome}>
              <FieldLabel htmlFor="nome">Nome</FieldLabel>
              <Input id="nome" {...form.register("nome")} />
              <FieldError errors={[form.formState.errors.nome]} />
            </Field>
            <Field data-invalid={!!form.formState.errors.codigo}>
              <FieldLabel htmlFor="codigo">Código</FieldLabel>
              <Input id="codigo" placeholder="produtos" disabled={!!editing} {...form.register("codigo")} />
              <FieldDescription>
                Identificador único usado nas permissões (ex.: <code>produtos.editar</code>). Não pode ser
                alterado depois de criado.
              </FieldDescription>
              <FieldError errors={[form.formState.errors.codigo]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="menuId">Menu</FieldLabel>
              <Select value={menuSelecionado} onValueChange={(v) => form.setValue("menuId", v)}>
                <SelectTrigger id="menuId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinos.map((destino) => (
                    <SelectItem key={destino.id} value={destino.id}>
                      {destino.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing && menuSelecionado !== menuId && (
                <FieldDescription>
                  O código não muda ao mover, então as permissões já concedidas nos perfis continuam
                  valendo.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
