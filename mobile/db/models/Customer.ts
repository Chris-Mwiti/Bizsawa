import { Model } from '@nozbe/watermelondb'
import {
  field,
  text,
  date,
  readonly,
  writer,
} from '@nozbe/watermelondb/decorators'

export default class Customer extends Model {
  static table = 'customers'

  @field('business_id') businessId!: string
  @text('name') name!: string
  @field('phone') phone?: string
  @field('email') email?: string
  @field('address') address?: string
  @field('tags') tags!: string
  @field('notes') notes?: string
  @field('loyalty_points') loyaltyPoints!: number
  @field('total_spend') totalSpend!: string
  @field('last_purchase_at') lastPurchaseAt?: number
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
