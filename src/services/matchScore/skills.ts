import type { PersonalInfo } from '../../types/index.ts'

export function addSkill(skills: string[], skill: string): string[] {
  const next = skill.trim()
  if (!next) return [...skills]
  if (skills.some((item) => item.trim().toLowerCase() === next.toLowerCase())) return [...skills]
  return [...skills, next]
}

export function removeSkill(skills: string[], skill: string): string[] {
  const needle = skill.trim().toLowerCase()
  if (!needle) return [...skills]
  return skills.filter((item) => item.trim().toLowerCase() !== needle)
}

export async function persistSkillChange(
  info: PersonalInfo,
  skill: string,
  mode: 'add' | 'remove',
  deps: {
    write: (info: PersonalInfo) => Promise<void>
    userId: () => Promise<string | null>
    save: (info: PersonalInfo, userId: string) => Promise<void>
  },
): Promise<{ ok: true; skills: string[]; saved: boolean }> {
  const current = Array.isArray(info.skills) ? info.skills.filter((item) => typeof item === 'string') : []
  const skills = mode === 'add' ? addSkill(current, skill) : removeSkill(current, skill)
  const next: PersonalInfo = { ...info, skills }
  await deps.write(next)
  const userId = await deps.userId()
  if (!userId) return { ok: true, skills, saved: false }
  try {
    await deps.save(next, userId)
    return { ok: true, skills, saved: true }
  } catch {
    return { ok: true, skills, saved: false }
  }
}
