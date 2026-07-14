const BASE = "/api/moderator";

export class ModApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function modFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "İstek başarısız" }));
    throw new ModApiError(err.error ?? `HTTP ${res.status}`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function modPost<T>(path: string, body?: unknown): Promise<T> {
  return modFetch<T>(path, {
    method: "POST",
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export async function modPatch<T>(path: string, body?: unknown): Promise<T> {
  return modFetch<T>(path, {
    method: "PATCH",
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export async function modDelete<T>(path: string): Promise<T> {
  return modFetch<T>(path, { method: "DELETE" });
}
