"use client";

import React, { useState } from "react"
import { Button } from "@/components/ui/button"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const isFormValid = name.trim() !== "" && email.trim() !== "" && email.includes("@");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const isPasswordValid = password.trim() !== "" && confirmPassword.trim() !== "" && password === confirmPassword;

  const [data, setData] = useState<string | null>(null);
  const handleSubmit = async () => {
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email, password }),
      });

      const result = await response.json();
      setData(result.message);
    } catch (error) {
      console.error(error);
      setData("Erro ao buscar dados.");
    }
  }

  return (
    <div className="grid grid-rows-[0px_1fr_0px] items-center justify-items-center min-h-screen gap-16 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-2 row-start-2 items-center sm:items-start">
        <Tabs defaultValue="account" className="w-[400px]">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="account" disabled>Account</TabsTrigger>
            <TabsTrigger value="password" disabled>Password</TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Criação de conta</CardTitle>
                <CardDescription>
                  Crie a sua conta para continuar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    placeholder="Tarcísio de Roma"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="username">Email</Label>
                  <Input
                    type="email"
                    id="email"
                    placeholder="tarcisiodograu@gmail.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <TabsList className="p-0">
                  <TabsTrigger className="h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90"
                    value="password"
                    disabled={!isFormValid}>Próximo</TabsTrigger>
                </TabsList>
              </CardFooter>
            </Card>
          </TabsContent>
          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle>Criação de conta</CardTitle>
                <CardDescription>
                  Escolhe uma senha boa ae.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor="current">Senha</Label>
                  <Input id="current" type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new">Confirme sua senha</Label>
                  <Input id="new" type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <TabsList className="p-0">
                  <TabsTrigger className="h-10 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground" value="account" >Voltar</TabsTrigger>
                </TabsList>
                <Button disabled={!isPasswordValid} onClick={handleSubmit}>Criar conta</Button>
              </CardFooter>
              {data}
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
