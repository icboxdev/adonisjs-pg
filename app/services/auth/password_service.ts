import User from '#models/user'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import { TokenService } from './token_service.js'
import { RateLimiter } from '../security/rate_limiter.js'
import { sharedCache } from '#services/shared/cache_service'
import CacheService from '#start/cache'
import { EmailService } from '#services/app_email_service'

interface PasswordResetRequestParams {
  email: string
  ip?: string
}

interface PasswordResetParams {
  email: string
  token: string
  password: string
  ip?: string
}

export class PasswordService {
  private static readonly RESET_TTL = '15m'
  private static readonly RATE_LIMIT_CONFIG = RateLimiter.getDefaultConfig()

  static async requestPasswordReset(params: PasswordResetRequestParams): Promise<boolean> {
    const { email, ip = 'unknown' } = params
    const normalizedEmail = email.trim().toLowerCase()

    const user = await User.query().where('email', normalizedEmail).firstOrFail()

    if (!user.isActive || user.isDeleted) {
      throw new Exception('Usuário inativo', { status: 403 })
    }

    const rateLimitCheck = await RateLimiter.check({
      identifier: `reset:${normalizedEmail}`,
      ip,
      config: this.RATE_LIMIT_CONFIG,
    })

    if (!rateLimitCheck.allowed) {
      await this.sendBlockedNotification(user, ip)
      return false
    }

    await RateLimiter.recordAttempt({
      identifier: `reset:${normalizedEmail}`,
      ip,
      config: this.RATE_LIMIT_CONFIG,
    })

    const { token, hash } = await TokenService.generateSecureToken()

    await TokenService.storeTokenHash({
      key: this.getResetKey(normalizedEmail),
      hash,
      ttl: this.RESET_TTL,
    })

    await this.sendResetEmail(user, token)
    return true
  }

  static async resetPassword(params: PasswordResetParams): Promise<boolean> {
    const { email, token, password, ip = 'unknown' } = params
    const normalizedEmail = email.trim().toLowerCase()

    await TokenService.validateToken({
      identifier: normalizedEmail,
      token,
      cacheKey: this.getResetKey(normalizedEmail),
    })

    const user = await User.query().where('email', normalizedEmail).firstOrFail()

    if (!user.isActive || user.isDeleted) {
      throw new Exception('Usuário inativo', { status: 403 })
    }

    user.password = password
    await user.save()

    await this.cleanupAfterReset(user.id, normalizedEmail, ip)
    await this.sendSuccessEmail(user, ip)

    return true
  }

  private static async cleanupAfterReset(
    userId: number,
    email: string,
    ip: string
  ): Promise<void> {
    await sharedCache.user.invalidateUser(userId)
    await CacheService.delete(this.getResetKey(email))
    await RateLimiter.clearAttempts(`reset:${email}`, ip)
  }

  private static async sendResetEmail(user: User, token: string): Promise<void> {
    await EmailService.send({
      to: user.email || user.username,
      subject: 'Recuperação de senha',
      isHtml: true,
      body: `
        <p>Olá ${user.name},</p>
        <p>Use o código abaixo para redefinir sua senha:</p>
        <p><strong>${token}</strong></p>
        <p>Válido por 15 minutos.</p>
      `,
    })
  }

  private static async sendSuccessEmail(user: User, ip: string): Promise<void> {
    await EmailService.send({
      to: user.email || user.username,
      subject: 'Senha alterada com sucesso',
      isHtml: true,
      body: `
        <p>Olá ${user.name},</p>
        <p>Sua senha foi alterada com sucesso.</p>
        <p><strong>IP:</strong> ${ip}</p>
        <p><strong>Data:</strong> ${DateTime.now().toFormat('dd/MM/yyyy HH:mm')}</p>
        <p>Se não foi você, entre em contato imediatamente.</p>
      `,
    })
  }

  private static async sendBlockedNotification(user: User, ip: string): Promise<void> {
    await EmailService.send({
      to: user.email || user.username,
      subject: 'Tentativas excessivas de recuperação de senha',
      isHtml: true,
      body: `
        <p>Olá ${user.name},</p>
        <p>Detectamos múltiplas tentativas de redefinição de senha.</p>
        <p><strong>IP:</strong> ${ip}</p>
        <p><strong>Horário:</strong> ${DateTime.now().toFormat('dd/MM/yyyy HH:mm')}</p>
        <p>Se não foi você, recomendamos alterar sua senha imediatamente.</p>
      `,
    })
  }

  private static getResetKey(email: string): string {
    return `reset:${email}`
  }
}