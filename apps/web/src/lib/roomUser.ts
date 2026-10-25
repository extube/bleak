import type { UserProfile } from "@ble-id/shared-types";

function key(roomId: string): string {
  return `ble-id-room-user:${roomId}`;
}

export function saveRoomUser(roomId: string, profile: UserProfile): void {
  localStorage.setItem(key(roomId), JSON.stringify(profile));
}

export function getRoomUser(roomId: string): UserProfile | null {
  const raw = localStorage.getItem(key(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}
