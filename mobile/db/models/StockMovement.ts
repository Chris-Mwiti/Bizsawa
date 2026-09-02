import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'
export default class StockMovement extends Model {
  static table = 'stock_movements'
  @field('business_id') businessId!: string
  @field('product_id') productId!: string
  @field('quantity_delta') quantityDelta!: string
  @field('movement_type') movementType!: string
  @field('reference_type') referenceType?: string
  @field('reference_id') referenceId?: string
  @field('notes') notes?: string
  @field('occurred_at') occurredAt!: number
  @field('sync_version') syncVersion!: number
  @field('deleted_at') deletedAt?: number
  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date
}
