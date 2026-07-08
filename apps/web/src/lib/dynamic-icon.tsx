import * as LucideIcons from "lucide-react";
import { Circle, type LucideProps } from "lucide-react";

function toPascalCase(kebab: string) {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

interface DynamicIconProps extends Omit<LucideProps, "name"> {
  name?: string | null;
}

export function DynamicIcon({ name, ...props }: DynamicIconProps) {
  if (!name) return <Circle {...props} />;
  const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<LucideProps>>)[
    toPascalCase(name)
  ];
  return Icon ? <Icon {...props} /> : <Circle {...props} />;
}
