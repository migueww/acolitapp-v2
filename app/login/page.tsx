"use client";

import * as React from "react";
import { ThemeToggleDropdown } from "@/components/theme-toggle";

import { LoginForm } from "@/components/login-form";


export default function Home() {
  return (
    <div className="grid grid-rows-[0px_1fr_0px] items-center justify-items-center min-h-screen gap-16 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-2 row-start-2 items-center sm:items-start">
        <ThemeToggleDropdown />
        <LoginForm />
      </main>
    </div>
  );
}
