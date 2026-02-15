"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";

type LogoutButtonProps = Omit<ButtonProps, "onClick" | "children"> & {
  label?: string;
  iconOnly?: boolean;
};

export function LogoutButton({ label = "Sair", disabled, iconOnly = false, ...props }: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  const handleLogout = async () => {
    setLoading(true);

    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
      setLoading(false);
    }
  };

  return (
    <Button type="button" variant="outline" onClick={() => void handleLogout()} disabled={disabled || loading} {...props}>
      <LogOut className="size-4" />
      {iconOnly ? <span className="sr-only">{loading ? "Saindo..." : label}</span> : loading ? "Saindo..." : label}
    </Button>
  );
}
