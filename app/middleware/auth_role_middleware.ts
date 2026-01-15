import User from '#models/user'
import { RoleService, UserRole } from '#services/auth/role_service'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class AuthRoleMiddleware {
  async handle(ctx: HttpContext, next: NextFn, role: UserRole) {
    const user = (await ctx.auth.authenticate()) as User

    if (!user.isActive || user.isDeleted) {
      return ctx.response.unauthorized({ message: 'User account is inactive or deleted' })
    }

    try {
      RoleService.checkRole(user, role)
    } catch (error) {
      return ctx.response.forbidden({
        message: 'You do not have permission to access this resource',
      })
    }

    return await next()
  }
}
