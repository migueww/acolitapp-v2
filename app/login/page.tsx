import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const auth = await getAuth();

  if (auth) {
    redirect("/masses");
  }

  return <LoginForm />;
}
