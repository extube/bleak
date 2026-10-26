import type {
  IncomeRecord,
  RoomProfile,
  UserProfile,
} from "@ble-id/shared-types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = res.headers.get("content-type")?.includes("application/json")
      ? await res.json().catch(() => ({}) as { error?: string })
      : undefined;
    throw new ApiError(
      res.status,
      (body as { error?: string })?.error ?? res.statusText,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function createRoom(roomId?: string): Promise<RoomProfile> {
  return request("/api/room", {
    method: "POST",
    body: JSON.stringify(roomId ? { roomId } : {}),
  });
}

export function createIncome(
  roomId: string,
  expiresInHours?: number,
): Promise<IncomeRecord> {
  return request(`/api/room/${encodeURIComponent(roomId)}/income`, {
    method: "POST",
    body: JSON.stringify(
      expiresInHours !== undefined ? { expiresInHours } : {},
    ),
  });
}

export function getIncome(tempId: string): Promise<IncomeRecord> {
  return request(`/api/income/${encodeURIComponent(tempId)}`);
}

export function softDeleteIncome(tempId: string): Promise<void> {
  return request(`/api/income/${encodeURIComponent(tempId)}`, {
    method: "DELETE",
  });
}

export function listIncome(roomId: string): Promise<IncomeRecord[]> {
  return request(`/api/room/${encodeURIComponent(roomId)}/income`);
}

export function createUser(
  roomId: string,
  body: {
    userId: string;
    name?: string;
    publicBio?: string;
    privateBio?: string;
  },
): Promise<UserProfile> {
  return request(`/api/room/${encodeURIComponent(roomId)}/users`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
