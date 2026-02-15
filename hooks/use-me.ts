"use client";

import * as React from "react";

import { ApiClientError, apiFetch } from "@/lib/api";

type MeResponse = {
  id: string;
  role: "CERIMONIARIO" | "ACOLITO";
  name: string;
  username: string;
  active: boolean;
  globalScore: number;
};

type UseMeResult =
  | { status: "loading"; me: null; error: null }
  | { status: "loggedOut"; me: null; error: ApiClientError | null }
  | { status: "loggedIn"; me: MeResponse; error: null };

export function useMe(): UseMeResult {
  const [state, setState] = React.useState<UseMeResult>({ status: "loading", me: null, error: null });

  React.useEffect(() => {
    let active = true;

    apiFetch<MeResponse>("/api/me")
      .then((me) => {
        if (!active) return;
        setState({ status: "loggedIn", me, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiClientError && error.status === 401) {
          setState({ status: "loggedOut", me: null, error });
          return;
        }

        setState({ status: "loggedOut", me: null, error: error as ApiClientError });
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}
