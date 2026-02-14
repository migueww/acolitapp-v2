"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button, type ButtonProps } from "@/components/ui/button";

type LogoutButtonProps = Omit<ButtonProps, "onClick" | "children"> & {
  label?: string;
};

export function LogoutButton({ label = "Sair", disabled, ...props }: LogoutButtonProps) {
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
      {loading ? "Saindo..." : label}
    </Button>
  );
}
