// Maps CustomResponse <-> the Supabase `custom_responses` table. See ./shared.ts for the model.
import { supabase } from '../supabase'
import { makeClientIds, replaceUserRows } from './shared'
import type { CustomResponse } from '../../types'

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchCustomResponsesFromDb(userId: string): Promise<CustomResponse[]> {
  const { data, error } = await supabase
    .from('custom_responses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at')
  if (error) throw error

  const nextId = makeClientIds()
  return (data ?? []).map((r: any) => ({
    id: nextId(),
    title: typeof r.title === 'string' ? r.title : '',
    text: typeof r.body === 'string' ? r.body : '',
    tags: Array.isArray(r.tags) ? r.tags : [],
  }))
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Replace-all: the whole list is rewritten on every mutation (add/edit/delete). The list is
// small and the client ids don't map to DB uuids, so this is simpler than per-row upserts.
export async function saveCustomResponsesToDb(
  userId: string,
  responses: CustomResponse[],
): Promise<void> {
  await replaceUserRows(
    'custom_responses',
    userId,
    responses.map((r) => ({
      user_id: userId,
      title: r.title || null,
      body: r.text || null,
      tags: r.tags ?? [],
    })),
  )
}
