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
import { DynamicIcon } from "@/lib/dynamic-icon";
import { IconPicker } from "@/components/crud/icon-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight,
  FolderTree,
  GripVertical,
  ListTree,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

interface ModuloComMenus extends Modulo {
  menus: Menu[];
}

export default function EstruturaPage() {
  const qc = useQueryClient();

  const modulosQuery = useQuery({
    queryKey: ["modulos"],
    queryFn: () => apiFetch<ModuloComMenus[]>("/modulos"),
  });
  const rotinasQuery = useQuery({
    queryKey: ["rotinas"],
    queryFn: () => apiFetch<Rotina[]>("/rotinas"),
  });

  const rotinasPorMenu = useMemo(() => {
    const map = new Map<string, Rotina[]>();
    for (const r of rotinasQuery.data ?? []) {
      if (!map.has(r.menuId)) map.set(r.menuId, []);
      map.get(r.menuId)!.push(r);
    }
    return map;
  }, [rotinasQuery.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["modulos"] });
    qc.invalidateQueries({ queryKey: ["rotinas"] });
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

  // Reordena localmente (feedback instantâneo) e persiste a nova "ordem"
  // (índice sequencial) de cada item afetado. Usado pelos 3 níveis
  // (módulos, menus de um módulo, rotinas de um menu).
  const handleModuloDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !modulosQuery.data) return;
    const oldIndex = modulosQuery.data.findIndex((m) => m.id === active.id);
    const newIndex = modulosQuery.data.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(modulosQuery.data, oldIndex, newIndex);
    qc.setQueryData(["modulos"], reordered);
    Promise.all(reordered.map((m, i) => updateModulo.mutateAsync({ id: m.id, input: { ordem: i } })))
      .then(invalidate)
      .catch(() => {
        toast.error("Erro ao salvar nova ordem dos módulos");
        invalidate();
      });
  };

  const handleMenuDragEnd = (modulo: ModuloComMenus) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modulo.menus.findIndex((m) => m.id === active.id);
    const newIndex = modulo.menus.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(modulo.menus, oldIndex, newIndex);
    qc.setQueryData<ModuloComMenus[]>(["modulos"], (old) =>
      old?.map((m) => (m.id === modulo.id ? { ...m, menus: reordered } : m)),
    );
    Promise.all(reordered.map((m, i) => updateMenu.mutateAsync({ id: m.id, input: { ordem: i } })))
      .then(invalidate)
      .catch(() => {
        toast.error("Erro ao salvar nova ordem dos menus");
        invalidate();
      });
  };

  // Rotina não tem coluna "ordem" no schema (só Módulo e Menu têm — são os
  // únicos níveis que aparecem em ordem visível, no menu lateral). Rotinas
  // não são arrastáveis por isso.

  // Dialogs -----------------------------------------------------------
  const [moduloDialog, setModuloDialog] = useState<{ editing: Modulo | null } | null>(null);
  const [menuDialog, setMenuDialog] = useState<{ moduloId: string; editing: Menu | null } | null>(null);
  const [rotinaDialog, setRotinaDialog] = useState<{ menuId: string; editing: Rotina | null } | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estrutura de menu</h1>
        <p className="text-sm text-muted-foreground">
          Módulos agrupam menus, e cada menu agrupa as rotinas usadas para controlar permissões (RBAC). O
          menu lateral do sistema é montado automaticamente a partir daqui, filtrado pelas permissões de
          cada perfil. Arraste pela alça (⋮⋮) pra reordenar.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setModuloDialog({ editing: null })}>
          <Plus className="size-4" />
          Novo módulo
        </Button>
      </div>

      {modulosQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuloDragEnd}>
        <SortableContext
          items={modulosQuery.data?.map((m) => m.id) ?? []}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {modulosQuery.data?.map((modulo) => (
              <ModuloRow
                key={modulo.id}
                modulo={modulo}
                rotinasPorMenu={rotinasPorMenu}
                onDragEndMenus={handleMenuDragEnd(modulo)}
                sensors={sensors}
                onEditModulo={() => setModuloDialog({ editing: modulo })}
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
                onDeleteMenu={async (menu) => {
                  if (!confirm(`Excluir o menu "${menu.nome}"?`)) return;
                  try {
                    await removeMenu.mutateAsync(menu.id);
                    toast.success("Menu excluído");
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : "Erro ao excluir menu");
                  }
                }}
                onCreateRotina={(menu) => setRotinaDialog({ menuId: menu.id, editing: null })}
                onEditRotina={(menu, rotina) => setRotinaDialog({ menuId: menu.id, editing: rotina })}
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

      {!modulosQuery.isLoading && modulosQuery.data?.length === 0 && (
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
          editing={menuDialog.editing}
          onClose={() => setMenuDialog(null)}
          onCreate={(input) => createMenu.mutateAsync(input)}
          onUpdate={(id, input) => updateMenu.mutateAsync({ id, input }).then(invalidate)}
        />
      )}

      {rotinaDialog && (
        <RotinaFormDialog
          menuId={rotinaDialog.menuId}
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
  rotinasPorMenu,
  onDragEndMenus,
  sensors,
  onEditModulo,
  onDeleteModulo,
  onCreateMenu,
  onEditMenu,
  onDeleteMenu,
  onCreateRotina,
  onEditRotina,
  onDeleteRotina,
}: {
  modulo: ModuloComMenus;
  rotinasPorMenu: Map<string, Rotina[]>;
  onDragEndMenus: (event: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
  onEditModulo: () => void;
  onDeleteModulo: () => void;
  onCreateMenu: () => void;
  onEditMenu: (menu: Menu) => void;
  onDeleteMenu: (menu: Menu) => void;
  onCreateRotina: (menu: Menu) => void;
  onEditRotina: (menu: Menu, rotina: Rotina) => void;
  onDeleteRotina: (rotina: Rotina) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: modulo.id,
  });

  return (
    <Collapsible
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      defaultOpen
      className="overflow-hidden rounded-2xl border border-border/70 bg-card"
      data-dragging={isDragging || undefined}
    >
      <div className="flex items-center gap-1 px-2 py-3 data-[dragging]:opacity-50">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1.5 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <CollapsibleTrigger asChild>
          <button className="group flex flex-1 items-center gap-3 text-left">
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <DynamicIcon name={modulo.icone} className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{modulo.nome}</p>
              <p className="text-xs text-muted-foreground">
                {modulo.menus.length} {modulo.menus.length === 1 ? "menu" : "menus"}
              </p>
            </div>
          </button>
        </CollapsibleTrigger>

        <div className="flex shrink-0 items-center gap-2">
          {!modulo.ativo && <Badge variant="secondary">Inativo</Badge>}
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
              <DropdownMenuItem variant="destructive" onClick={onDeleteModulo}>
                <Trash2 className="size-4" /> Excluir módulo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CollapsibleContent>
        <div className="divide-y divide-border/60 border-t border-border/60">
          {modulo.menus.length === 0 && (
            <p className="px-4 py-4 pl-14 text-sm text-muted-foreground">
              Nenhum menu neste módulo ainda.
            </p>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndMenus}>
            <SortableContext items={modulo.menus.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              {modulo.menus.map((menu) => (
                <MenuRow
                  key={menu.id}
                  menu={menu}
                  rotinas={rotinasPorMenu.get(menu.id) ?? []}
                  onEdit={() => onEditMenu(menu)}
                  onDelete={() => onDeleteMenu(menu)}
                  onCreateRotina={() => onCreateRotina(menu)}
                  onEditRotina={(rotina) => onEditRotina(menu, rotina)}
                  onDeleteRotina={onDeleteRotina}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MenuRow({
  menu,
  rotinas,
  onEdit,
  onDelete,
  onCreateRotina,
  onEditRotina,
  onDeleteRotina,
}: {
  menu: Menu;
  rotinas: Rotina[];
  onEdit: () => void;
  onDelete: () => void;
  onCreateRotina: () => void;
  onEditRotina: (rotina: Rotina) => void;
  onDeleteRotina: (rotina: Rotina) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: menu.id,
  });

  return (
    <Collapsible
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="bg-muted/20"
      data-dragging={isDragging || undefined}
    >
      <div className="flex items-center gap-1 py-2.5 pr-4 pl-10 data-[dragging]:opacity-50">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>

        <CollapsibleTrigger asChild>
          <button className="group flex flex-1 items-center gap-2.5 text-left">
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            <DynamicIcon name={menu.icone} className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{menu.nome}</p>
              {menu.rota && (
                <p className="truncate font-mono text-xs text-muted-foreground">{menu.rota}</p>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">
            {rotinas.length} {rotinas.length === 1 ? "rotina" : "rotinas"}
          </Badge>
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
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-4" /> Excluir menu
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CollapsibleContent>
        <div className="space-y-1 py-2 pr-4 pl-[4.75rem]">
          {rotinas.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma rotina neste menu ainda.</p>
          )}

          {rotinas.map((rotina) => (
            <RotinaRow
              key={rotina.id}
              rotina={rotina}
              onEdit={() => onEditRotina(rotina)}
              onDelete={() => onDeleteRotina(rotina)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RotinaRow({
  rotina,
  onEdit,
  onDelete,
}: {
  rotina: Rotina;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
      <div className="flex items-center gap-2 text-sm">
        <ListTree className="size-3.5 text-muted-foreground" />
        <span>{rotina.nome}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {rotina.codigo}
        </code>
        {!rotina.ativo && <Badge variant="secondary">Inativo</Badge>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-4" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="size-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
  editing,
  onClose,
  onCreate,
  onUpdate,
}: {
  moduloId: string;
  editing: Menu | null;
  onClose: () => void;
  onCreate: (input: MenuCreate) => Promise<unknown>;
  onUpdate: (id: string, input: Partial<MenuCreate>) => Promise<unknown>;
}) {
  const form = useForm<MenuCreate>({
    resolver: zodResolver(menuCreateSchema),
    defaultValues: {
      moduloId,
      menuPaiId: editing?.menuPaiId ?? null,
      nome: editing?.nome ?? "",
      icone: editing?.icone ?? "",
      rota: editing?.rota ?? "",
      ordem: editing?.ordem ?? 0,
      ativo: editing?.ativo ?? true,
    },
  });

  const onSubmit = async (values: MenuCreate) => {
    try {
      if (editing) {
        await onUpdate(editing.id, values);
        toast.success("Menu atualizado");
      } else {
        await onCreate(values);
        toast.success("Menu cadastrado");
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
  editing,
  onClose,
  onCreate,
  onUpdate,
}: {
  menuId: string;
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
    },
  });

  const onSubmit = async (values: RotinaCreate) => {
    try {
      if (editing) {
        await onUpdate(editing.id, values);
        toast.success("Rotina atualizada");
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
