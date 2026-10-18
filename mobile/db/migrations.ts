// WatermelonDB schema migrations. WatermelonDB validates this spec at
// startup (dev) and throws "Invalid migrations!" on any gap or duplicate,
// so versions must be contiguous 2..N matching schema version N.
// schemaMigrations() itself runs that validation on construction —
// lib/__tests__/dbMigrations.test.ts pins the sequence so a bad edit fails
// in CI instead of on a user's device.
import { tableSchema } from '@nozbe/watermelondb'
import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        {
          type: 'add_columns',
          table: 'sale_lines',
          columns: [
            {
              name: 'product_variant_id',
              type: 'string',
              isOptional: true,
            },
          ],
        },
        {
          type: 'add_columns',
          table: 'order_lines',
          columns: [
            {
              name: 'product_variant_id',
              type: 'string',
              isOptional: true,
            },
          ],
        },
      ],
    },
    {
      toVersion: 3,
      steps: [
        {
          type: 'add_columns',
          table: 'payments',
          columns: [{ name: 'type', type: 'string', isOptional: true }],
        },
      ],
    },
    {
      toVersion: 4,
      steps: [
        {
          type: 'create_table',
          schema: tableSchema({
            name: 'payment_commands',
            columns: [
              { name: 'business_id', type: 'string', isIndexed: true },
              { name: 'order_id', type: 'string', isIndexed: true },
              { name: 'amount', type: 'string' },
              { name: 'currency', type: 'string' },
              { name: 'phone', type: 'string', isOptional: true },
              { name: 'status', type: 'string' },
              { name: 'provider', type: 'string' },
              { name: 'type', type: 'string' },
              { name: 'idempotency_key', type: 'string', isOptional: true },
              { name: 'sync_version', type: 'number' },
              { name: 'deleted_at', type: 'number', isOptional: true },
            ],
          }),
        },
      ],
    },
    {
      toVersion: 5,
      steps: [
        {
          type: 'add_columns',
          table: 'orders',
          columns: [
            { name: 'payment_status', type: 'string', isOptional: true },
            { name: 'confirmed_at', type: 'number', isOptional: true },
            { name: 'fulfilled_at', type: 'number', isOptional: true },
          ],
        },
      ],
    },
    {
      toVersion: 6,
      steps: [
        {
          type: 'add_columns',
          table: 'conflicts',
          columns: [
            { name: 'client_device_id', type: 'string', isOptional: true },
            { name: 'server_device_id', type: 'string', isOptional: true },
          ],
        },
      ],
    },
  ],
})
