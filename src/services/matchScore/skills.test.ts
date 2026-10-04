import assert from 'node:assert/strict'
import test from 'node:test'
import { cloneDefaultPersonalInfo } from '../../lib/personalInfoDefaults.ts'
import { addSkill, persistSkillChange, removeSkill } from './skills.ts'

test('skills are added once and removed case-insensitively', () => {
  assert.deepEqual(addSkill(['TypeScript'], ' typescript '), ['TypeScript'])
  assert.deepEqual(addSkill(['TypeScript'], 'Go'), ['TypeScript', 'Go'])
  assert.deepEqual(removeSkill(['TypeScript', 'Go'], 'typescript'), ['Go'])
})

test('a skill write updates the mirror and saves only when signed in', async () => {
  const writes: unknown[] = []
  const saves: string[] = []
  const signedOut = await persistSkillChange(cloneDefaultPersonalInfo(), 'Go', 'add', {
    write: async (info) => {
      writes.push(info.skills)
    },
    userId: async () => null,
    save: async () => {
      throw new Error('should not save')
    },
  })
  assert.deepEqual(signedOut.skills, ['Go'])
  assert.equal(signedOut.saved, false)

  const signedIn = await persistSkillChange(
    { ...cloneDefaultPersonalInfo(), skills: ['Go'] },
    'Go',
    'remove',
    {
      write: async (info) => {
        writes.push(info.skills)
      },
      userId: async () => 'user-1',
      save: async (_info, userId) => {
        saves.push(userId)
      },
    },
  )
  assert.deepEqual(signedIn.skills, [])
  assert.equal(signedIn.saved, true)
  assert.deepEqual(saves, ['user-1'])
  assert.deepEqual(writes, [['Go'], []])
})
