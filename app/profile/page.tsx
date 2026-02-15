import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import { ProfileView } from "./ProfileView";

export default async function ProfilePage() {
  const auth = await getAuth();
  if (!auth) {
    redirect("/login");
  }

  return <ProfileView />;
}
