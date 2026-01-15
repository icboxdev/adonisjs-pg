import AppKey from '#models/app_key'
import env from '#start/env'
import cache from '@adonisjs/cache/services/main'
import logger from '@adonisjs/core/services/logger'
import redis from '@adonisjs/redis/services/main'
import { DateTime } from 'luxon'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

interface LoggerPayload {
  ip?: string
  keyId?: number | null
  event: string
  success: boolean
  reason: string
}

interface RateLimitData {
  attempts: number
  firstAttempt: number
  blockedUntil?: number
}

/* -------------------------------------------------------------------------- */
/*                                AppKeyService                                */
/* -------------------------------------------------------------------------- */

export class AppKeyService {
  /* -------------------------------- Constants ------------------------------- */

  private static readonly CACHE_ACTIVE_KEYS = 'active_app_keys'
  private static readonly CACHE_ALL_KEYS = 'all_app_keys'

  private static readonly MAX_ATTEMPTS = 5
  private static readonly RATE_LIMIT_WINDOW = 60 // seconds
  private static readonly BLOCK_DURATION = 900 // seconds

  private static readonly LOGGER_KEY = env.get('LOGGER_REDIS_KEY')
  private static readonly LOGGER_TTL = Number(env.get('LOGGER_REDIS_TTL'))

  /* ----------------------------- Key Utilities ------------------------------ */

  static getPrivateKey(): string {
    return env.get('PRIVATE_KEY')
  }

  static getPublicKey(): string {
    return env.get('PUBLIC_KEY')
  }

  static calculateExpiration(days = 365): DateTime {
    return DateTime.now().plus({ days })
  }

  static isExpired(key: { expiresAt: DateTime | null }): boolean {
    if (!key.expiresAt) return false
    return key.expiresAt < DateTime.now()
  }

  static async safeCompare(expected: string, provided: string): Promise<boolean> {
    try {
      const expectedHash = createHash('sha256').update(expected).digest()
      const providedHash = createHash('sha256').update(provided).digest()
      return timingSafeEqual(expectedHash, providedHash)
    } catch (error) {
      logger.error(error)
      return false
    }
  }

  /* ----------------------------- Cache Control ------------------------------ */

  static async clearActiveCache(): Promise<void> {
    await cache.delete({ key: this.CACHE_ACTIVE_KEYS })
  }

  static async clearAllCache(): Promise<void> {
    await cache.delete({ key: this.CACHE_ALL_KEYS })
  }

  /* ----------------------------- CRUD (Controller) -------------------------- */

  static async db_create(params: {
    description: string
    value?: string
    isActive: boolean
    daysExpires?: number
    permission?: string[]
  }): Promise<AppKey> {
    const value = params.value ?? randomBytes(48).toString('hex')

    const key = await AppKey.create({
      value,
      isActive: params.isActive,
      description: params.description,
      permission: params.permission,
      expiresAt: this.calculateExpiration(params.daysExpires),
    })

    await this.clearActiveCache()
    await this.clearAllCache()

    return key
  }

  static async db_update(params: {
    id: number
    payload: {
      description?: string
      daysExpires?: number
      isActive?: boolean
      permission?: string[]
    }
  }): Promise<AppKey> {
    const key = await AppKey.findOrFail(params.id)

    if (params.payload.daysExpires !== undefined) {
      key.expiresAt = this.calculateExpiration(params.payload.daysExpires)
    }

    key.merge(params.payload)
    await key.save()

    await this.clearActiveCache()
    await this.clearAllCache()

    return key
  }

  static async db_delete(params: { id: number }): Promise<boolean> {
    const key = await AppKey.find(params.id)
    if (!key) return false

    await key.delete()
    await this.clearActiveCache()
    await this.clearAllCache()

    return true
  }

  static async db_list(): Promise<AppKey[]> {
    const cached = await cache.get<AppKey[]>({ key: this.CACHE_ALL_KEYS })
    if (cached) return cached

    const keys = await AppKey.all()
    await cache.set({ key: this.CACHE_ALL_KEYS, value: keys, ttl: '10m' })

    return keys
  }

  /* ------------------------ Active Keys (Middleware) ------------------------ */

  // static async listActive(): Promise<AppKey[]> {
  //   const cached = await cache.get<AppKey[]>({ key: this.CACHE_ACTIVE_KEYS })
  //   if (cached) return cached

  //   const keys = await AppKey.query()
  //     .where('active', true)
  //     .where('expires_at', '>', DateTime.now().toISO())

  //   await cache.set({
  //     key: AppKeyService.CACHE_ACTIVE_KEYS,
  //     value: keys.map((k) => ({
  //       ...k.serialize(),
  //       expiresAt: k.expiresAt?.toMillis() ?? null,
  //     })),
  //     ttl: env.get('CACHE_TTL'),
  //   })

  //   return keys
  // }

  static async listActive(): Promise<AppKey[]> {
    const cached = await cache.get<AppKey[]>({ key: this.CACHE_ACTIVE_KEYS })
    if (cached) return cached

    const now = DateTime.now()

    /* ---------------------------------------------------------------------- */
    /* 1. Desativa chaves expiradas                                            */
    /* ---------------------------------------------------------------------- */

    await AppKey.query()
      .where('is_active', true)
      .whereNotNull('expires_at')
      .where('expires_at', '<=', now.toISO())
      .update({ is_active: false })

    /* ---------------------------------------------------------------------- */
    /* 2. Busca apenas chaves válidas                                          */
    /* ---------------------------------------------------------------------- */

    const keys = await AppKey.query()
      .where('is_active', true)
      .where((query) => {
        query.whereNull('expires_at').orWhere('expires_at', '>', now.toISO())
      })

    /* ---------------------------------------------------------------------- */
    /* 3. Cacheia DTO (nunca entidade Lucid)                                  */
    /* ---------------------------------------------------------------------- */

    const dto = keys.map((k) => ({
      ...k.serialize(),
      expiresAt: k.expiresAt?.toMillis() ?? null,
    }))

    await cache.set({
      key: this.CACHE_ACTIVE_KEYS,
      value: dto,
      ttl: env.get('CACHE_TTL'),
    })

    return keys
  }


  static async findValidKey(keys: AppKey[], providedKey: string): Promise<AppKey | null> {
    for (const key of keys) {
      if (this.isExpired({ expiresAt: key.expiresAt })) continue
      if (await this.safeCompare(key.value, providedKey)) return key
    }
    return null
  }

  static async disableKey(id: number): Promise<void> {
    await AppKey.query().where('id', id).update({ isActive: false })
    await this.clearActiveCache()
  }

  /* ----------------------------- Rate Limiting ------------------------------ */

  static async isKeyBlocked(keyId: number): Promise<boolean> {
    const blockKey = `key_blocked:${keyId}`
    const blockedUntil = await cache.get<number>({ key: blockKey })

    if (!blockedUntil) return false

    if (Date.now() > blockedUntil) {
      await cache.delete({ key: blockKey })
      return false
    }

    return true
  }

  static async checkRateLimit(ip: string, key: string): Promise<boolean> {
    const rateKey = `rate_limit:${ip}:${key}`
    const data = await cache.get<RateLimitData>({ key: rateKey })

    if (!data) return false

    const expired = Date.now() - data.firstAttempt > this.RATE_LIMIT_WINDOW * 1000
    if (expired) {
      await cache.delete({ key: rateKey })
      return false
    }

    return true
  }

  static async incrementRateLimit(ip: string, key: string): Promise<void> {
    const rateKey = `rate_limit:${ip}:${key}`
    const data = await cache.get<RateLimitData>({ key: rateKey })
    const now = Date.now()

    if (!data) {
      await cache.set({
        key: rateKey,
        value: { attempts: 1, firstAttempt: now },
        ttl: '1m',
      })
      return
    }

    const attempts = data.attempts + 1
    const shouldBlock = attempts >= this.MAX_ATTEMPTS

    await cache.set({
      key: rateKey,
      value: {
        attempts,
        firstAttempt: data.firstAttempt,
        blockedUntil: shouldBlock ? now + this.BLOCK_DURATION * 1000 : undefined,
      },
      ttl: shouldBlock ? '15m' : '1m',
    })
  }

  static async handleSuccessfulAttempt(key: string): Promise<void> {
    await cache.delete({ key: `failed_attempts:${key}` })
  }

  static async handleFailedAttempt(key: string, ip: string): Promise<void> {
    await this.incrementRateLimit(ip, key)
  }

  /* ------------------------------ Redis Logger ------------------------------ */

  static async loggerAttempt(payload: LoggerPayload): Promise<void> {
    const log = {
      ...payload,
      timestamp: DateTime.now().toISO(),
    }

    payload.success ? logger.info(log) : logger.error(log)

    if (payload.success) return

    const now = Date.now()

    await redis.zadd(this.LOGGER_KEY, now, JSON.stringify(log))

    const expireBefore = now - this.LOGGER_TTL * 1000
    await redis.zremrangebyscore(this.LOGGER_KEY, 0, expireBefore)
  }

  static async get_loggers(limit = 100): Promise<any[]> {
    const logs = await redis.zrevrange(this.LOGGER_KEY, 0, limit - 1)
    return logs.map((l) => JSON.parse(l))
  }
}
