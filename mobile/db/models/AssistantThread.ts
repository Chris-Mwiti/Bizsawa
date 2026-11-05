import { Model } from '@nozbe/watermelondb'
import { field, readonly, date } from '@nozbe/watermelondb/decorators'

export default class AssistantThread extends Model {
  static table = 'assistant_threads'

  @field('business_id') businessId!: string
  @field('thread_id') threadId!: string
  @field('state') state!: string
  @field('updated_at_ms') updatedAtMs!: number

  @readonly @date('created_at') createdAt!: Date
  @readonly @date('updated_at') updatedAt!: Date
}
