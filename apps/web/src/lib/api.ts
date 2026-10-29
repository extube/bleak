import type {
  HandshakeContact,
  HandshakeRecord,
  HandshakeStatus,
  IncomeRecord,
  RoomProfile,
  ShareProfile,
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

// -- Handshakes (in-room contacts) --------------------------------------------

/** Idempotent — the server merges duplicate/reverse pairs into one record. */
export function createHandshake(
  roomId: string,
  fromUser: string,
  toUser: string,
): Promise<HandshakeRecord> {
  return request(`/api/room/${encodeURIComponent(roomId)}/handshakes`, {
    method: "POST",
    body: JSON.stringify({ fromUser, toUser }),
  });
}

export function listHandshakes(
  roomId: string,
  user: string,
): Promise<HandshakeContact[]> {
  return request(
    `/api/room/${encodeURIComponent(roomId)}/handshakes?user=${encodeURIComponent(user)}`,
  );
}

export function setHandshakeStatus(
  roomId: string,
  handshakeId: string,
  byUser: string,
  status: HandshakeStatus,
): Promise<HandshakeContact> {
  return request(
    `/api/room/${encodeURIComponent(roomId)}/handshakes/${encodeURIComponent(handshakeId)}`,
    { method: "PATCH", body: JSON.stringify({ byUser, status }) },
  );
}

/**
 * Share-safe profile. `privateBio` appears only when the viewer's handshake
 * with the target is mutual friend.
 */
export function getShareProfile(
  roomId: string,
  userId: string,
  viewer?: string,
): Promise<ShareProfile> {
  const suffix = viewer ? `?viewer=${encodeURIComponent(viewer)}` : "";
  return request(
    `/api/room/${encodeURIComponent(roomId)}/users/${encodeURIComponent(userId)}/share${suffix}`,
  );
}
