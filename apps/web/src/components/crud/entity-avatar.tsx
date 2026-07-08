import { avatarColorClass, initials } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";

/** Avatar circular com iniciais, cor estável derivada do nome (estilo contato). */
export function EntityAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        avatarColorClass(name),
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}

/** Avatar circular com ícone, para entidades que não são pessoas (empresa, perfil). */
export function EntityIconAvatar({
  icon: Icon,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary",
        className,
      )}
    >
      <Icon className="size-5" />
    </div>
  );
}
