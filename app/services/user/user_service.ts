import User from '#models/user'
import { UserRole } from '#services/auth/role_service'
import { sharedCache } from '#services/shared/cache_service'
import CacheService from '#start/cache'
import { Exception } from '@adonisjs/core/exceptions'

export interface UserEntity {
  isActive: boolean
  name: string
  lastName: string | null
  email: string
  username: string | null
  password: string
  role: string
  settings?: object | any | null
}

export interface UserEntityUpdate {
  active?: boolean
  name?: string
  lastName?: string | null
  email?: string
  username?: string | null
  password?: string
  role?: string
  settings?: object | any | null
}

export class UserService {
  static async findById(id: number): Promise<User> {
    const cacheKey = sharedCache.user.userKey(id)
    const cached = await CacheService.get<User>(cacheKey)

    if (cached) {
      return cached
    }

    const user = await User.findOrFail(id)
    await CacheService.set({
      key: cacheKey,
      value: user.serialize(),
      ttl: '1h',
    })

    return user
  }

  static async getMe(user: User): Promise<User> {
    const auth = await this.findById(user.id)

    if (!this.isActive(auth)) {
      throw new Exception('Usuário inativo', { status: 403 })
    }

    return auth
  }

  static async create(payload: UserEntity) {
    const user = await User.create(payload)
    await sharedCache.user.invalidateUser()
    return user.serialize()
  }

  static async update(user: User, payload: UserEntityUpdate) {
    user.merge(payload)
    await user.save()
    await this.invalidateUserCache(user.id)
    return user.serialize()
  }

  static async delete(user: User): Promise<boolean> {
    await this.invalidateUserCache(user.id)
    await user.delete()
    return true
  }

  static async checkStartSetup(): Promise<boolean> {
    const existingSuperAdmin = await User.query()
      .where('is_deleted', false)
      .andWhere('role', UserRole.SUPER)
      .first()

    return !existingSuperAdmin
  }

  static async createSuperAdmin(payload: UserEntity): Promise<boolean> {
    const startSetup = await this.checkStartSetup()
    if (startSetup) {
      payload.role = UserRole.SUPER
      payload.isActive = true
      await User.create({ isDeleted: false, ...payload })
      return true
    } else {
      throw new Error('Já existe um super administrador cadastrado.')
    }
  }

  static async invalidateUserCache(id: number): Promise<void> {
    await sharedCache.user.invalidateUser(id)
  }

  static async list() {
    const cacheKey = sharedCache.user.listKey
    const cached = await CacheService.get<User[]>(cacheKey)

    if (cached) {
      return cached
    }

    const users = await User.query().where('is_deleted', false).orderBy('created_at', 'desc')
    const serialized = users.map((u) => u.serialize())

    await CacheService.set({
      key: cacheKey,
      value: serialized,
      ttl: '10m',
    })

    return serialized
  }

  static isActive(user: User): boolean {
    if (!user) {
      throw new Exception('Usuário não encontrado', { status: 404 })
    }
    return user.isActive && !user.isDeleted
  }
}
