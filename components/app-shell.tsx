"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, CalendarDays, LayoutDashboard, UserRound, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import { CerimonialColorDropdown, ThemeModeDropdown, useCerimonialThemeSync } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type AppShellUser = {
  id: string;
  role: "CERIMONIARIO" | "ACOLITO";
  name: string;
};

type AppShellProps = {
  user: AppShellUser;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItemsByRole = (role: AppShellUser["role"]): NavItem[] => {
  const base: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/masses", label: "Missas", icon: CalendarDays },
    { href: "/profile", label: "Perfil", icon: UserRound },
  ];

  if (role === "CERIMONIARIO") {
    base.push({ href: "/liturgy", label: "Liturgia", icon: BookMarked });
    base.push({ href: "/users", label: "Usuarios", icon: Users });
  }

  return base;
};

const isActivePath = (pathname: string, href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);
const roleLabel = (role: AppShellUser["role"]): string => (role === "CERIMONIARIO" ? "Cerimoniario" : "Acolito");
// const roleDescription = (role: AppShellUser["role"]): string =>
//   role === "CERIMONIARIO" ? "Gestao completa de celebracoes e equipe" : "Participacao e confirmacao de presenca";

export function AppShell({ user, title, description, actions, children }: AppShellProps) {
  const pathname = usePathname();
  const navItems = navItemsByRole(user.role);
  const currentNavItem = navItems.find((item) => isActivePath(pathname, item.href));
  const activeSectionLabel = currentNavItem?.label ?? "Area atual";
  useCerimonialThemeSync(user.role === "CERIMONIARIO");

  return (
      <SidebarProvider defaultOpen>
        <Sidebar variant="inset" collapsible="icon">
          <SidebarHeader>
            <div className="space-y-3 px-2 py-1">
              <div className="rounded-lg border border-sidebar-border/70 bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden">
                <p className="text-sm font-semibold">Acolit App</p>
                <p className="mt-1 text-xs text-muted-foreground">Gestao de celebracoes</p>
              </div>
              <div className="hidden size-8 items-center justify-center rounded-md border border-sidebar-border/70 bg-sidebar-accent/50 text-xs font-semibold group-data-[collapsible=icon]:flex">
                AA
              </div>
              <div className="space-y-1 rounded-md border border-dashed border-sidebar-border/70 p-2 group-data-[collapsible=icon]:hidden">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Secao atual</p>
                <p className="text-sm font-medium">{activeSectionLabel}</p>
              </div>
            </div>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navegacao</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActivePath(pathname, item.href)} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="space-y-1 rounded-md border p-2 group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
            {/* <p className="text-xs text-muted-foreground">{roleDescription(user.role)}</p> */}
          </div>
          <ThemeModeDropdown showLabel className="justify-start group-data-[collapsible=icon]:hidden" />
          {user.role === "CERIMONIARIO" ? (
            <CerimonialColorDropdown showLabel className="justify-start group-data-[collapsible=icon]:hidden" />
          ) : null}
          <LogoutButton className="w-full justify-start group-data-[collapsible=icon]:hidden" />
          <div className="hidden w-full flex-col items-center gap-1 group-data-[collapsible=icon]:flex">
            <ThemeModeDropdown className="size-8" />
            {user.role === "CERIMONIARIO" ? <CerimonialColorDropdown className="size-8" /> : null}
            <LogoutButton iconOnly size="icon" className="size-8" />
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 border-b bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{activeSectionLabel}</p>
                <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
                {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
              </div>
            </div>
            <div className={cn("flex items-center gap-2", actions ? "opacity-100" : "opacity-0")}>{actions ?? <span />}</div>
          </div>
        </header>
        <div className="space-y-6 p-6 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
