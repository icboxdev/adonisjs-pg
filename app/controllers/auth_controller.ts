import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { AuthService } from '#services/auth/auth_services'
import { UserService } from '#services/user/user_service'
import {
  authUpdateValidator,
  RequestEmailValidator,
  passwordResetValidator,
  authPasswordUpdateValidator,
  userCreateValidator,
} from '#validators/app_validators'
import { errors as vineErrors } from '@vinejs/vine'
import { Exception } from '@adonisjs/core/exceptions'
import logger from '@adonisjs/core/services/logger'

export default class AuthController {
  async checkStartSetup({ response }: HttpContext) {
    try {
      const startSetup = await UserService.checkStartSetup()
      return response.ok({ started: startSetup })
    } catch (error) {
      logger.error({ err: error }, 'Failed to check start setup')
      return this.handleError(error, response, 'Falha ao verificar setup inicial')
    }
  }
  async createSuperUser({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(userCreateValidator)

      const success = await UserService.createSuperAdmin(payload)

      if (!success) {
        return response.badRequest({
          message: 'Já existe um super administrador cadastrado.',
        })
      }

      return response.ok({
        message: 'Super administrador criado com sucesso',
      })
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return response.unprocessableEntity({
          message: 'Erro de validação',
          errors: error.messages,
        })
      }

      logger.error({ err: error }, 'Failed to create super user')
      return this.handleError(error, response, 'Falha ao criar super usuário')
    }
  }

  //
  async login({ request, response }: HttpContext) {
    try {
      const { username, password } = request.only(['username', 'password'])
      const ip = request.ip()

      const { token, user } = await AuthService.login({ username, password, ip })

      return response.ok({
        isAuthenticated: true,
        token,
        tokenType: 'Bearer',
        user,
      })
    } catch (error) {
      if (error.status === 401) {
        return response.unauthorized({ message: error.message })
      }

      if (error.status === 403) {
        return response.forbidden({ message: error.message })
      }

      if (error.status === 429) {
        return response.tooManyRequests({ message: error.message })
      }

      logger.error({ err: error, email: request.input('email'), ip: request.ip() }, 'Login failed')
      return this.handleError(error, response, 'Falha ao realizar login')
    }
  }

  async logout({ auth, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const currentToken = user.currentAccessToken

      if (!currentToken) {
        return response.badRequest({ message: 'Nenhum token ativo encontrado' })
      }

      await User.accessTokens.delete(user, currentToken.identifier)
      await UserService.invalidateUserCache(user.id)

      return response.ok({ message: 'Logout realizado com sucesso' })
    } catch (error) {
      logger.error({ err: error, userId: auth.user?.id }, 'Logout failed')
      return this.handleError(error, response, 'Falha ao realizar logout')
    }
  }

  async revokeAll({ auth, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      await AuthService.logout(user)

      return response.ok({ message: 'Todos os tokens foram revogados com sucesso' })
    } catch (error) {
      logger.error({ err: error, userId: auth.user?.id }, 'Token revocation failed')
      return this.handleError(error, response, 'Falha ao revogar tokens')
    }
  }

  async me({ auth, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const authUser = await AuthService.getMe(user)

      return response.ok({ user: authUser, isAuthenticated: true})
    } catch (error) {
      if (error.status === 403) {
        return response.forbidden({ message: error.message })
      }

      logger.error({ err: error, userId: auth.user?.id }, 'Failed to fetch user data')
      return this.handleError(error, response, 'Falha ao buscar dados do usuário')
    }
  }

  async updateMe({ auth, request, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const payload = await request.validateUsing(authUpdateValidator)

      if (payload.email && payload.email !== user.email) {
        const isBlacklisted = await AuthService.isBlacklisted({
          email: payload.email,
        })

        if (isBlacklisted) {
          return response.forbidden({
            message: 'Este email não pode ser utilizado',
          })
        }
      }

      const updatedUser = await AuthService.updateUser(user, payload)

      return response.ok({
        message: 'Dados atualizados com sucesso',
        user: updatedUser,
      })
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return response.unprocessableEntity({
          message: 'Erro de validação',
          errors: error.messages,
        })
      }

      logger.error({ err: error, userId: auth.user?.id }, 'Failed to update user data')
      return this.handleError(error, response, 'Falha ao atualizar dados do usuário')
    }
  }

  async requestEmailVerification({ auth, request, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const ip = request.ip()

      if (user.emailVerifiedAt) {
        return response.badRequest({
          message: 'E-mail já verificado',
        })
      }

      const success = await AuthService.requestEmailVerification(user, ip)

      if (!success) {
        return response.tooManyRequests({
          message: 'Muitas tentativas. Tente novamente mais tarde.',
        })
      }

      return response.ok({
        message: 'E-mail de verificação enviado com sucesso',
      })
    } catch (error) {
      logger.error({ err: error, userId: auth.user?.id }, 'Email verification request failed')
      return this.handleError(error, response, 'Falha ao solicitar verificação de e-mail')
    }
  }

  async verifyEmail({ auth, request, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const { token } = request.only(['token'])
      const ip = request.ip()

      if (user.emailVerifiedAt) {
        return response.badRequest({
          message: 'E-mail já verificado',
        })
      }

      if (!token) {
        return response.badRequest({
          message: 'Token de verificação é obrigatório',
        })
      }

      await AuthService.verifyEmail(user.email || user.username, token, ip)

      return response.ok({
        message: 'E-mail verificado com sucesso',
      })
    } catch (error) {
      if (error.status === 400) {
        return response.badRequest({ message: error.message })
      }

      logger.error({ err: error, userId: auth.user?.id }, 'Email verification failed')
      return this.handleError(error, response, 'Falha ao verificar e-mail')
    }
  }

  async requestPasswordReset({ request, response }: HttpContext) {
    try {
      const { email } = await request.validateUsing(RequestEmailValidator)
      const ip = request.ip()

      const success = await AuthService.requestPasswordReset(email, ip)

      if (!success) {
        return response.tooManyRequests({
          message: 'Muitas tentativas. Tente novamente mais tarde.',
        })
      }

      return response.ok({
        message: 'Código de recuperação de senha foi enviado para o e-mail',
      })
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return response.unprocessableEntity({
          message: 'Erro de validação',
          errors: error.messages,
        })
      }

      if (error.status === 404) {
        return response.ok({
          message: 'Se o e-mail existir, você receberá as instruções em breve',
        })
      }

      logger.error({ err: error, email: request.input('email') }, 'Password reset request failed')
      return this.handleError(error, response, 'Falha ao solicitar recuperação de senha')
    }
  }

  async changePassword({ auth, request, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const { password, currentPassword } = await request.validateUsing(authPasswordUpdateValidator)

      await AuthService.updatePassword(user, password, currentPassword)

      return response.ok({
        message: 'Senha alterada com sucesso',
      })
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return response.unprocessableEntity({
          message: 'Erro de validação',
          errors: error.messages,
        })
      }

      if (error.status === 400) {
        return response.badRequest({ message: error.message })
      }

      logger.error({ err: error, userId: auth.user?.id }, 'Password change failed')
      return this.handleError(error, response, 'Falha ao alterar senha')
    }
  }

  async resetPassword({ request, response }: HttpContext) {
    try {
      const { email, token, password } = await request.validateUsing(passwordResetValidator)
      const ip = request.ip()

      await AuthService.resetPassword({ email, token, password, ip })

      return response.ok({
        message: 'Senha redefinida com sucesso',
      })
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return response.unprocessableEntity({
          message: 'Erro de validação',
          errors: error.messages,
        })
      }

      if (error.status === 400) {
        return response.badRequest({ message: error.message })
      }

      if (error.status === 403) {
        return response.forbidden({ message: error.message })
      }

      logger.error({ err: error }, 'Password reset failed')
      return this.handleError(error, response, 'Falha ao redefinir senha')
    }
  }

  private handleError(error: any, response: HttpContext['response'], fallbackMessage: string) {
    if (error instanceof Exception) {
      const status = error.status || 500
      logger.error({ err: error, status }, error.message)

      return response.status(status).send({
        message: error.message,
      })
    }

    logger.error({ err: error }, fallbackMessage)
    return response.internalServerError({
      message: fallbackMessage,
    })
  }
}
