"use client";

import * as React from "react";
import { MonitorCog, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CerimonialPalette = "white" | "yellow";

const CERIMONIAL_THEME_STORAGE_KEY = "cerimonial-theme";
const CERIMONIAL_THEME_CLASS: Record<CerimonialPalette, string> = {
  white: "theme-cerimonial-white",
  yellow: "theme-cerimonial-yellow",
};

const applyCerimonialThemeClass = (palette: CerimonialPalette) => {
  const root = document.documentElement;
  root.classList.remove(CERIMONIAL_THEME_CLASS.white, CERIMONIAL_THEME_CLASS.yellow);
  root.classList.add(CERIMONIAL_THEME_CLASS[palette]);
};

export function useCerimonialThemeSync(enabled: boolean) {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    root.classList.remove(CERIMONIAL_THEME_CLASS.white, CERIMONIAL_THEME_CLASS.yellow);
    if (!enabled) return;

    const saved = window.localStorage.getItem(CERIMONIAL_THEME_STORAGE_KEY);
    const palette: CerimonialPalette = saved === "yellow" ? "yellow" : "white";
    applyCerimonialThemeClass(palette);
  }, [enabled]);
}

export function ThemeModeDropdown({
  className,
  align = "end",
  showLabel = false,
}: {
  className?: string;
  align?: "start" | "center" | "end";
  showLabel?: boolean;
}) {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={showLabel ? "default" : "icon"} className={cn("relative", showLabel && "w-full justify-start", className)}>
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          {showLabel ? <span>Modo</span> : <span className="sr-only">Modo</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>Modo</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 size-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 size-4" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <MonitorCog className="mr-2 size-4" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CerimonialColorDropdown({
  className,
  align = "end",
  showLabel = false,
}: {
  className?: string;
  align?: "start" | "center" | "end";
  showLabel?: boolean;
}) {
  const setCerimonialPalette = (palette: CerimonialPalette) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CERIMONIAL_THEME_STORAGE_KEY, palette);
    }
    applyCerimonialThemeClass(palette);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={showLabel ? "default" : "icon"} className={cn(showLabel && "w-full justify-start", className)}>
          <Palette className="size-4" />
          {showLabel ? <span>Cor</span> : <span className="sr-only">Cor principal</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>Cor principal</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setCerimonialPalette("white")}>Branco</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setCerimonialPalette("yellow")}>Amarelo</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
