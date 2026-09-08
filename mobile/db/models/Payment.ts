import { Model } from '@nozbe/watermelondb'
import { field, date, readonly, writer } from '@nozbe/watermelondb/decorators'
export default class Payment extends Model {
  static table = 'payment_commands'
  @field('business_id') businessId!: string
  @field('order_id') orderId!: string
  @field('amount') amount!: string
  @field('currency') currency!: string
  @field('phone') phone?: string
  @field('status') status!: string
  @field('provider') provider!: string
  @field('type') type!: string
  @field('idempotency_key') idempotencyKey?: string
  @field('sync_version') syncVersion!: number
  @field('deleted_at') deletedAt?: number
  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date
  @writer async markDeletedLocal() {
    await this.update((r: any) => {
      r.deletedAt = Date.now()
    })
    await this.markAsDeleted()
  }
}
