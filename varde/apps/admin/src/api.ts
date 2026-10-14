export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  if (response.status === 401) window.location.assign('/auth/login');
  if (response.status === 403) window.dispatchEvent(new Event('varde:forbidden'));
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    throw new ApiError(
      response.status,
      typeof body?.message === 'string' ? body.message : 'Noko gjekk gale. Prøv igjen.',
    );
  }
  return (await response.json()) as T;
}

export const mutate = <T>(path: string, method = 'POST', body?: object) =>
  api<T>(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
