// The service worker records the History row in the database as soon as the fill
// is stored locally, so another device sees it in free_fills_this_week without
// waiting for the popup to reconcile. The popup insert of the same row is ignored
// once the unique key exists; until then the RPC counts distinct (occurred_at, site).
import type { FillHistoryEntry } from '../../types/index.ts'
import { insertFillHistoryToDb } from '../../lib/sync/fillHistory.ts'
import { getUserIdOrNull } from '../../lib/sync/shared.ts'

export async function syncRecordedFill(entry: FillHistoryEntry | null | undefined): Promise<void> {
  if (!entry || typeof entry.timestamp !== 'number') return
  const userId = await getUserIdOrNull()
  if (!userId) return
  await insertFillHistoryToDb(userId, [entry])
}
