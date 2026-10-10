import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeParsedResume } from './parsedResume.ts'
import { dbRowsToProfile } from './sync/profileRows.ts'

const snapshot = {
  contact: {
    name: 'Jane Q Doe',
    email: 'jane@example.com',
    phone: '555-0100',
    address: '1 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    country: 'United States',
    linkedin: 'in/janedoe',
  },
  work_history: [
    { company: 'Acme', title: 'Engineer', start_date: '2021-06', end_date: '', current: true, bullets: ['Shipped'] },
  ],
  education: [{ institution: 'State U', degree: 'BS', field: 'CS', end_date: '2018' }],
  skills: ['Go', 'Python'],
}

test('normalizeParsedResume splits the name and maps structured address parts', () => {
  const out = normalizeParsedResume({ name: 'Jane Q Doe', ...snapshot })
  assert.equal(out.firstName, 'Jane')
  assert.equal(out.middleName, 'Q')
  assert.equal(out.lastName, 'Doe')
  assert.equal(out.phone, '555-0100')
  assert.equal(out.address, '1 Main St')
  assert.equal(out.zip, '78701')
  assert.equal(out.state, 'TX')
  assert.equal(out.experience?.length, 1)
  assert.equal(out.education?.[0].schoolName, 'State U')
})

test('a profile row with only the parse snapshot still loads Personal/Work/Education', () => {
  const info = dbRowsToProfile({
    profile: {
      id: 'p1',
      email: 'jane@example.com',
      full_name: 'Jane Q Doe',
      first_name: null,
      last_name: null,
      phone: null,
      contact: snapshot.contact,
      work_history: snapshot.work_history,
      education: snapshot.education,
      skills: snapshot.skills,
    },
    work_experience: [],
    education: [],
    skills: [],
  })
  assert.equal(info.firstName, 'Jane')
  assert.equal(info.lastName, 'Doe')
  assert.equal(info.phone, '555-0100')
  assert.equal(info.experience.length, 1)
  assert.equal(info.education.length, 1)
  assert.deepEqual(info.skills, ['Go', 'Python'])
  assert.equal(info.email, 'jane@example.com')
})

test('editable columns win over the snapshot, and full_name alone is split', () => {
  const real = dbRowsToProfile({
    profile: { first_name: 'Janet', last_name: 'Roe', contact: snapshot.contact, work_history: snapshot.work_history },
  })
  assert.equal(real.firstName, 'Janet')
  assert.equal(real.experience.length, 0)

  const nameOnly = dbRowsToProfile({ profile: { full_name: 'Ada Lovelace', email: 'a@b.co' } })
  assert.equal(nameOnly.firstName, 'Ada')
  assert.equal(nameOnly.lastName, 'Lovelace')
})
