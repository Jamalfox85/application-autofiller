// A load that started for profile A must not write A's bundle after a create/swap
// has already published profile B as the active mirror.
export function shouldWriteProfileLoad(
  intendedId: string | null | undefined,
  mirroredId: string | null | undefined,
): boolean {
  if (!mirroredId || !intendedId) return true
  return mirroredId === intendedId
}
