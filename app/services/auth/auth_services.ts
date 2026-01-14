import User from '#models/user'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import { PasswordService } from '#services/auth/password_service'
import { EmailVerificationService } from '#services/auth/email_verification_service'
import { UserService } from '#services/user/user_service'
import { UserAnonymizationService } from '#services/user/user_anonymization_service'
import { BlacklistService } from '#services/security/blacklist_service'
import CacheService from '#start/cache'
import { sharedCache } from '#services/shared/cache_service'
import { TokenService } from '#services/auth/token_service'
import { RoleService, UserRole } from '#services/auth/role_service'
import { LoginProtectionService } from '#services/security/login_protection_service'
import hash from '@adonisjs/core/services/hash'

interface LoginParams {
  email: string
  password: string
  ip?: string
}

interface LoginResult {
  token: any
  user: any
}

export class AuthService {
  /* -------------------------------------------------------------------------- */
  /* AUTHENTICATION                                                             */
  /* -------------------------------------------------------------------------- */
  // ADICIONAR no topo

  // SUBSTITUIR o método login() por:
  static async login(params: LoginParams): Promise<LoginResult> {
    const { email, password, ip = 'unknown' } = params

    if (!email || !password) {
      throw new Exception('Credenciais inválidas', { status: 401 })
    }

    // Verifica se pode fazer login
    const loginCheck = await LoginProtectionService.checkLoginAttempt({
      identifier: email.trim().toLowerCase(),
      ip,
    })

    if (!loginCheck.allowed) {
      if (loginCheck.isBlocked) {
        throw new Exception(
          'Conta temporariamente bloqueada devido a múltiplas tentativas de login. Verifique seu email.',
          { status: 403 }
        )
      }

      throw new Exception(
        `Muitas tentativas de login. Tente novamente em alguns minutos. Tentativas restantes: ${loginCheck.attemptsRemaining}`,
        { status: 429 }
      )
    }

    const user = await User.query().where('email', email).orWhere('username', email).first()

    if (!user || !UserService.isActive(user)) {
      // Registra tentativa falha
      await LoginProtectionService.recordLoginAttempt({
        identifier: email.trim().toLowerCase(),
        ip,
        success: false,
      })
      throw new Exception('Credenciais inválidas', { status: 401 })
    }

    const authUser = await User.verifyCredentials(email, password)

    if (!authUser) {
      // Registra tentativa falha com dados do usuário
      await LoginProtectionService.recordLoginAttempt({
        identifier: email.trim().toLowerCase(),
        ip,
        success: false,
        userName: user.name,
        userEmail: user.email,
      })
      throw new Exception('Credenciais inválidas', { status: 401 })
    }

    // Login bem-sucedido - limpa tentativas
    await LoginProtectionService.recordLoginAttempt({
      identifier: email.trim().toLowerCase(),
      ip,
      success: true,
    })

    const token = await TokenService.createAccessToken(authUser)
    await this.updateLoginMetadata(authUser, ip)
    await this.cacheUser(authUser)

    return {
      token,
      user: authUser.serialize(),
    }
  }

  static async logout(user: User): Promise<boolean> {
    return await TokenService.revokeAllTokens(user)
  }

  static async getMe(user: User): Promise<User> {
    return await UserService.getMe(user)
  }

  /* -------------------------------------------------------------------------- */
  /* ROLE MANAGEMENT                                                            */
  /* -------------------------------------------------------------------------- */
  static checkRole(user: User, required: UserRole): void {
    RoleService.checkRole(user, required)
  }

  static checkSuper(user: User): void {
    RoleService.checkSuper(user)
  }

  static checkAdmin(user: User): void {
    RoleService.checkAdmin(user)
  }

  static checkUser(user: User): void {
    RoleService.checkUser(user)
  }

  static checkView(user: User): void {
    RoleService.checkView(user)
  }

  /* -------------------------------------------------------------------------- */
  /* USER MANAGEMENT (DELEGAÇÃO)                                                */
  /* -------------------------------------------------------------------------- */
  static async createUser(payload: any) {
    return await UserService.create(payload)
  }

  static async updateUser(user: User, payload: any) {
    return await UserService.update(user, payload)
  }

  static async deleteUser(user: User): Promise<boolean> {
    return await UserService.delete(user)
  }

  static async listUsers() {
    return await UserService.list()
  }

  static async anonymizeUser(user: User): Promise<boolean> {
    return await UserAnonymizationService.anonymize(user)
  }

  /* -------------------------------------------------------------------------- */
  /* PASSWORD MANAGEMENT (DELEGAÇÃO)                                            */
  /* -------------------------------------------------------------------------- */
  static async requestPasswordReset(email: string, ip?: string): Promise<boolean> {
    return await PasswordService.requestPasswordReset({ email, ip })
  }

  static async updatePassword(
    user: User,
    password: string,
    currentPassword: string
  ): Promise<boolean> {
    const isPasswordValid = await hash.verify(user.password, currentPassword)
    
    if (!isPasswordValid) {
      throw new Exception('Senha atual inválida', { status: 400 })
    }

    user.password = password
    await user.save()
    await UserService.invalidateUserCache(user.id)
    return true
  }

  static async resetPassword(params: {
    email: string
    token: string
    password: string
    ip?: string
  }): Promise<boolean> {
    return await PasswordService.resetPassword(params)
  }

  /* -------------------------------------------------------------------------- */
  /* EMAIL VERIFICATION (DELEGAÇÃO)                                             */
  /* -------------------------------------------------------------------------- */
  static async requestEmailVerification(user: User, ip?: string): Promise<boolean> {
    return await EmailVerificationService.requestEmailVerification({ user, ip })
  }

  static async verifyEmail(email: string, token: string, ip?: string): Promise<boolean> {
    return await EmailVerificationService.verifyEmail({ email, token, ip })
  }

  /* -------------------------------------------------------------------------- */
  /* BLACKLIST (DELEGAÇÃO)                                                      */
  /* -------------------------------------------------------------------------- */
  static async isBlacklisted(input: { email: string; username: string }): Promise<boolean> {
    return await BlacklistService.isBlacklisted(input)
  }

  static async addToBlacklist(user: User): Promise<void> {
    await BlacklistService.addToBlacklist(user)
  }

  /* -------------------------------------------------------------------------- */
  /* PRIVATE HELPERS                                                            */
  /* -------------------------------------------------------------------------- */
  private static async updateLoginMetadata(user: User, ip?: string): Promise<void> {
    user.merge({
      lastLoginAt: DateTime.now(),
      lastIp: ip ?? null,
    })
    await user.save()
  }

  private static async cacheUser(user: User): Promise<void> {
    await CacheService.set({
      key: sharedCache.user.userKey(user.id),
      value: user.serialize(),
      ttl: '1h',
    })
  }
}

export { UserRole } from './role_service.js'
export type { UserEntity, UserEntityUpdate } from '../user/user_service.js'
