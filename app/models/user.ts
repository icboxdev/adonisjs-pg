import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string | null

  @column()
  declare name: string

  @column()
  declare username: string

  @column()
  declare isActive: boolean

  @column()
  declare isDeleted: boolean | null


  @column()
  declare role: string

  @column()
  declare settings: object | any | null

  @column()
  declare lastLoginAt: DateTime | null

  @column()
  declare emailVerifiedAt: DateTime | null

  @column()
  declare lastIp: string | null

  @column({ serializeAs: null })
  declare password: string

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  static accessTokens = DbAccessTokensProvider.forModel(User)
}