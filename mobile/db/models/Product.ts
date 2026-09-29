import { Model } from '@nozbe/watermelondb'
import {
  field,
  text,
  date,
  readonly,
  writer,
} from '@nozbe/watermelondb/decorators'
import { randomUUID } from 'expo-crypto'

export default class Product extends Model {
  static table = 'products'

  @field('business_id') businessId!: string
  @field('tenant_id') tenantId!: string
  @text('name') name!: string
  @text('description') description?: string
  @field('sku') sku?: string
  @text('category') category!: string
  @field('barcode') barcode?: string
  @field('image_url') imageUrl?: string
  @field('tax_rule_id') taxRuleId?: string
  @field('price') price!: string
  @field('cost') cost!: string
  @field('is_active') isActive!: boolean
  @field('sync_version') syncVersion!: number
  @field('deleted_at') deletedAt?: number

  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date

  @writer async markDeleted() {
    await this.update((rec: any) => {
      rec.deletedAt = Date.now()
    })
    await this.markAsDeleted()
  }

  static async createRaw(db: any, businessId: string, data: Partial<Product>) {
    return db.write(async () => {
      const col = db.get('products')
      return col.create((rec: any) => {
        rec._raw.id = randomUUID()
        rec.businessId = businessId
        rec.name = data.name
        rec.category = data.category || 'Other'
        rec.price = data.price || '0'
        rec.cost = data.cost || '0'
        rec.isActive = true
        rec.syncVersion = 1
      })
    })
  }
}
