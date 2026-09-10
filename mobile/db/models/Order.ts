import { Model } from '@nozbe/watermelondb'
import { field, date, readonly, writer } from '@nozbe/watermelondb/decorators'

export default class Order extends Model {
  static table = 'orders'
  @field('business_id') businessId!: string
  @field('customer_id') customerId?: string
  @field('status') status!: string
  @field('subtotal') subtotal!: string
  @field('tax_amount') taxAmount!: string
  @field('total') total!: string
  @field('payment_method') paymentMethod!: string
  @field('payment_status') paymentStatus?: string
  @field('idempotency_key') idempotencyKey?: string
  @field('confirmed_at') confirmedAt?: number
  @field('fulfilled_at') fulfilledAt?: number
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
