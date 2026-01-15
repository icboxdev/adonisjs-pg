import User from '#models/user'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { Exception } from '@adonisjs/core/exceptions'
import { sharedCache } from '#services/shared/cache_service'
import CacheService from '#start/cache'

interface TokenGenerationResult {
  token: string
  hash: string
}

interface TokenValidationParams {
  identifier: string
  token: string
  cacheKey: string
}

export class TokenService {
  static async generateSecureToken(): Promise<TokenGenerationResult> {
    const token = randomBytes(16).toString('hex')
    const hash = createHash('sha256').update(token).digest('hex')
    return { token, hash }
  }

  static async storeTokenHash(params: { key: string; hash: string; ttl: string }): Promise<void> {
    await CacheService.set({
      key: params.key,
      value: params.hash,
      ttl: params.ttl,
    })
  }

  static async validateToken(params: TokenValidationParams): Promise<boolean> {
    const storedHash = await CacheService.get<string>(params.cacheKey)

    if (!storedHash) {
      throw new Exception('Token inválido ou expirado', { status: 400 })
    }

    const providedHash = createHash('sha256').update(params.token).digest('hex')

    if (!timingSafeEqual(Buffer.from(storedHash), Buffer.from(providedHash))) {
      throw new Exception('Token inválido ou expirado', { status: 400 })
    }

    return true
  }

  static async createAccessToken(user: User) {
    await this.revokeAllAccessTokens(user)
    return await User.accessTokens.create(user, ['*'], { name: 'access_token', expiresIn: 86400 })
  }

  static async revokeAllAccessTokens(user: User): Promise<void> {
    const tokens = await User.accessTokens.all(user)
    await Promise.all(tokens.map((t) => User.accessTokens.delete(user, t.identifier)))
  }

  static async revokeAllTokens(user: User): Promise<boolean> {
    try {
      await this.revokeAllAccessTokens(user)
      await sharedCache.user.invalidateUser(user.id)
      return true
    } catch (error) {
      throw new Exception('Falha ao revogar tokens', { status: 500 })
    }
  }
}
