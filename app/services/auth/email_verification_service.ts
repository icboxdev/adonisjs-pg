import User from '#models/user'
import { DateTime } from 'luxon'
import { EmailService } from '#services/app_email_service'
import CacheService from '#start/cache'
import { sharedCache } from '#services/shared/cache_service'
import { RateLimiter } from '#services/security/rate_limiter'
import { TokenService } from '#services/auth/token_service'

interface EmailVerificationRequestParams {
  user: User
  ip?: string
}

interface EmailVerificationParams {
  email: string
  token: string
  ip?: string
}

export class EmailVerificationService {
  private static readonly VERIFY_TTL = '24h'
  private static readonly RATE_LIMIT_CONFIG = RateLimiter.getDefaultConfig()

  static async requestEmailVerification(params: EmailVerificationRequestParams): Promise<boolean> {
    const { user, ip = 'unknown' } = params
    const normalizedEmail = user.email || user.username

    const rateLimitCheck = await RateLimiter.check({
      identifier: `verify:${normalizedEmail.trim().toLowerCase()}`,
      ip,
      config: this.RATE_LIMIT_CONFIG,
    })

    if (!rateLimitCheck.allowed) {
      return false
    }

    await RateLimiter.recordAttempt({
      identifier: `verify:${normalizedEmail.trim().toLowerCase()}`,
      ip,
      config: this.RATE_LIMIT_CONFIG,
    })

    const { token, hash } = await TokenService.generateSecureToken()

    await TokenService.storeTokenHash({
      key: this.getVerifyKey(normalizedEmail.trim().toLowerCase()),
      hash,
      ttl: this.VERIFY_TTL,
    })

    await this.sendVerificationEmail(user, token)
    return true
  }

  static async verifyEmail(params: EmailVerificationParams): Promise<boolean> {
    const { email, token, ip = 'unknown' } = params
    const normalizedEmail = email.trim().toLowerCase()

    await TokenService.validateToken({
      identifier: normalizedEmail,
      token,
      cacheKey: this.getVerifyKey(normalizedEmail),
    })

    const user = await User.query().where('email', normalizedEmail).firstOrFail()

    user.emailVerifiedAt = DateTime.now()
    await user.save()

    await this.cleanupAfterVerification(user.id, normalizedEmail, ip)

    return true
  }

  private static async cleanupAfterVerification(
    userId: number,
    email: string,
    ip: string
  ): Promise<void> {
    await sharedCache.user.invalidateUser(userId)
    await CacheService.delete(this.getVerifyKey(email))
    await RateLimiter.clearAttempts(`verify:${email}`, ip)
  }

  private static async sendVerificationEmail(user: User, token: string): Promise<void> {
    await EmailService.send({
      to: user.email || user.username,
      subject: 'Verificação de E-mail',
      isHtml: true,
      body: `
        <p>Olá ${user.name},</p>
        <p>Por favor, use o código abaixo para verificar seu endereço de e-mail:</p>
        <p><strong>${token}</strong></p>
        <p>Este código é válido por 24 horas.</p>
        <p>Se você não criou uma conta, ignore este e-mail.</p>
      `,
    })
  }

  private static getVerifyKey(email: string): string {
    return `verify_email:${email}`
  }
}
