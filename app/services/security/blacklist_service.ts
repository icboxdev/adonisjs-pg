import AuthDeleted from '#models/auth_deleted'
import User from '#models/user'
import { createHash } from 'crypto'
import { Exception } from '@adonisjs/core/exceptions'
import logger from '@adonisjs/core/services/logger'

interface BlacklistCheckInput {
  email: string
}

export class BlacklistService {
  static async isBlacklisted(input: BlacklistCheckInput): Promise<boolean> {
    try {
      const emailHash = this.hashValue(input.email)

      const record = await AuthDeleted.query()
        .where('user_email', emailHash)
        .first()

      return !!record
    } catch (error) {
      logger.error({ err: error }, 'Failed to check blacklist')
      throw new Exception('Falha ao verificar lista negra', { status: 500 })
    }
  }

  static async addToBlacklist(user: User): Promise<void> {
    try {
      if (!user) {
        throw new Exception('Usuário não encontrado', { status: 404 })
      }

      if (user.isDeleted) {
        throw new Exception('Usuário já está na lista negra', { status: 400 })
      }

      const emailHash = this.hashValue(user.email || user.username)

      await AuthDeleted.create({
        userId: user.id.toString(),
        userEmail: emailHash,
      })
    } catch (error) {
      logger.error({ err: error }, 'Failed to add user to blacklist')
      throw new Exception('Falha ao adicionar usuário à lista negra', { status: 500 })
    }
  }

  private static hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}