import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.boolean('is_deleted').notNullable().defaultTo(false)
      table.string('name', 96).nullable()
      table.string('email', 254).nullable().unique()
      table.string('username', 128).notNullable().unique()
      table.string('password').notNullable()
      table.string('role', 10).nullable().defaultTo('view')
      table.datetime('email_verified_at').nullable()
      table.jsonb('settings').nullable()
      table.datetime('last_login_at').nullable()
      table.string('last_ip', 50).nullable()
      table.timestamp('deleted_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}