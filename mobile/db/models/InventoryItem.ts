import { Model } from '@nozbe/watermelondb'
import { field, date, readonly, writer } from '@nozbe/watermelondb/decorators'
export default class InventoryItem extends Model {
  static table = 'inventory_items'
  @field('business_id') businessId!: string
  @field('product_id') productId!: string
  @field('quantity') quantity!: string
  @field('low_stock_threshold') lowStockThreshold!: string
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
