import { Model } from '@nozbe/watermelondb'
import { field, date, readonly, writer } from '@nozbe/watermelondb/decorators'

export default class Sale extends Model {
  static table = 'sales'

  @field('business_id') businessId!: string
  @field('order_id') orderId?: string
  @field('customer_id') customerId?: string
  @field('receipt_number') receiptNumber!: string
  @field('staff_id') staffId!: string
  @field('payment_method') paymentMethod!: string
  @field('subtotal') subtotal!: string
  @field('tax_amount') taxAmount!: string
  @field('total') total!: string
  @field('status') status!: string
  @field('sold_at') soldAt!: number
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
