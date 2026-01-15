import { EmailService } from '#services/app_email_service'
import CacheService from '#start/cache'
import { RateLimiter } from './rate_limiter.js'
import { DateTime } from 'luxon'

interface LoginAttemptParams {
  identifier: string
  ip: string
  success: boolean
  userName?: string
  userEmail?: string | null
}

interface LoginCheckParams {
  identifier: string
  ip: string
}

interface LoginProtectionResult {
  allowed: boolean
  attemptsRemaining: number
  blockedUntil?: number
  isBlocked: boolean
}

export class LoginProtectionService {
  private static readonly MAX_ATTEMPTS = 5
  private static readonly WINDOW_MS = 15 * 60 * 1000 // 15 min
  private static readonly BLOCK_TIME_MS = 30 * 60 * 1000 // 30 min
  private static readonly EXTENDED_BLOCK_TIME_MS = 2 * 60 * 60 * 1000 // 2 horas

  private static readonly RATE_LIMIT_CONFIG = {
    maxAttempts: this.MAX_ATTEMPTS,
    windowMs: this.WINDOW_MS,
    blockTimeMs: this.BLOCK_TIME_MS,
  }

  static async checkLoginAttempt(params: LoginCheckParams): Promise<LoginProtectionResult> {
    const { identifier, ip } = params

    const rateLimitCheck = await RateLimiter.check({
      identifier: `login:${identifier}`,
      ip,
      config: this.RATE_LIMIT_CONFIG,
    })

    const isBlocked = await this.isAccountBlocked(identifier)

    if (isBlocked) {
      const blockedUntil = await CacheService.get<number>(this.getAccountBlockKey(identifier))
      return {
        allowed: false,
        attemptsRemaining: 0,
        blockedUntil: blockedUntil || undefined,
        isBlocked: true,
      }
    }

    return {
      allowed: rateLimitCheck.allowed,
      attemptsRemaining: rateLimitCheck.attemptsRemaining,
      blockedUntil: rateLimitCheck.blockedUntil,
      isBlocked: false,
    }
  }

  static async recordLoginAttempt(params: LoginAttemptParams): Promise<void> {
    const { identifier, ip, success, userName, userEmail } = params

    if (success) {
      await this.clearLoginAttempts(identifier, ip)
      return
    }

    await RateLimiter.recordAttempt({
      identifier: `login:${identifier}`,
      ip,
      config: this.RATE_LIMIT_CONFIG,
    })

    const attempts = await this.getFailedAttempts(identifier, ip)

    if (attempts >= this.MAX_ATTEMPTS) {
      await this.blockAccount(identifier)

      if (userEmail && userName) {
        await this.sendAccountBlockedEmail(userName, userEmail, ip)
      }
    }
  }

  static async clearLoginAttempts(identifier: string, ip: string): Promise<void> {
    await RateLimiter.clearAttempts(`login:${identifier}`, ip)
  }

  private static async blockAccount(identifier: string): Promise<void> {
    const blockedUntil = Date.now() + this.EXTENDED_BLOCK_TIME_MS

    await CacheService.set({
      key: this.getAccountBlockKey(identifier),
      value: blockedUntil,
      ttl: `${this.EXTENDED_BLOCK_TIME_MS / 1000}s`,
    })
  }

  private static async isAccountBlocked(identifier: string): Promise<boolean> {
    const blockedUntil = await CacheService.get<number>(this.getAccountBlockKey(identifier))
    return blockedUntil !== null && Date.now() < blockedUntil
  }

  private static async getFailedAttempts(identifier: string, ip: string): Promise<number> {
    const attemptsKey = `ratelimit:attempts:login:${identifier}:${ip}`
    return (await CacheService.get<number>(attemptsKey)) ?? 0
  }

  private static async sendAccountBlockedEmail(
    userName: string,
    email: string,
    ip: string
  ): Promise<void> {
    const blockDuration = this.EXTENDED_BLOCK_TIME_MS / (60 * 60 * 1000) // horas

    await EmailService.send({
      to: email,
      subject: 'Conta temporariamente bloqueada - Tentativas de login suspeitas',
      isHtml: true,
      body: `
        <p>Olá ${userName},</p>
        <p><strong>Sua conta foi temporariamente bloqueada</strong> devido a múltiplas tentativas de login incorretas.</p>
        
        <p><strong>Detalhes do bloqueio:</strong></p>
        <ul>
          <li><strong>IP:</strong> ${ip}</li>
          <li><strong>Data/Hora:</strong> ${DateTime.now().toFormat('dd/MM/yyyy HH:mm')}</li>
          <li><strong>Duração do bloqueio:</strong> ${blockDuration} horas</li>
        </ul>
        
        <p><strong>O que fazer:</strong></p>
        <ul>
          <li>Se foi você tentando fazer login, aguarde ${blockDuration} horas e tente novamente</li>
          <li>Se você esqueceu sua senha, use a opção "Esqueci minha senha"</li>
          <li>Se não foi você, sua conta pode estar sendo atacada. Recomendamos alterar sua senha imediatamente após o desbloqueio</li>
        </ul>
        
        <p>Se você não reconhece essas tentativas de login, entre em contato com nosso suporte imediatamente.</p>
        
        <p><strong>Equipe de Segurança</strong></p>
      `,
    })
  }

  private static getAccountBlockKey(identifier: string): string {
    return `account:blocked:${identifier}`
  }
}