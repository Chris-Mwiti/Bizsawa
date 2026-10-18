import { describe, expect, it } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stepsForMigration } = require('@nozbe/watermelondb/Schema/migrations/stepsForMigration')
import { migrations } from '../../db/migrations'
import { schema } from '../../db/schema'

// Constructing the spec above already runs WatermelonDB's own validation
// (throws "Invalid migrations!" on gaps/duplicates in dev). These tests pin
// the version sequence so a broken edit fails here, not on a user's device.
describe('watermelon migrations spec', () => {
  it('covers every version from 2 to the schema version without gaps', () => {
    const versions = migrations.sortedMigrations.map((m: any) => m.toVersion)
    expect(versions).toEqual([2, 3, 4, 5, 6])
    expect(migrations.maxVersion).toBe(schema.version)
  })

  it('migrates 5 -> 6 by adding the conflict device columns', () => {
    const steps = stepsForMigration({ migrations, fromVersion: 5, toVersion: 6 }) as any[]
    expect(steps).toHaveLength(1)
    expect(steps[0].type).toBe('add_columns')
    expect(steps[0].table).toBe('conflicts')
    expect(steps[0].columns.map((c: any) => c.name).sort()).toEqual([
      'client_device_id',
      'server_device_id',
    ])
  })

  it('resolves steps for a fresh v1 install through to current', () => {
    const steps = stepsForMigration({ migrations, fromVersion: 1, toVersion: 6 }) as any[]
    expect(steps.length).toBeGreaterThan(0)
  })
})
