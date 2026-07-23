"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function FiltersPopover({
  active,
  onClear,
  children,
}: {
  active: boolean;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="relative">
          <Filter className="size-4" />
          Filtros
          {active && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="end">
        <div className="space-y-3">
          {children}
          {active && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
