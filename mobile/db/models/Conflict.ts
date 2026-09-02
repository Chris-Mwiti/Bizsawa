import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'
export default class Conflict extends Model {
  static table = 'conflicts'
  @field('business_id') businessId!: string
  @field('table_name') tableName!: string
  @field('record_id') recordId!: string
  @field('client_payload') clientPayload!: string
  @field('server_payload') serverPayload!: string
  @field('client_version') clientVersion!: number
  @field('server_version') serverVersion!: number
  @field('resolution') resolution?: string
  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date
}
