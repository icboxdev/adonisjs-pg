import type { HttpContext } from '@adonisjs/core/http'
import { AuthService } from '#services/auth/auth_services'
import { UserService } from '#services/user/user_service'
import { userCreateValidator, userUpdateValidator } from '#validators/app_validators'
import { errors as vineErrors } from '@vinejs/vine'
import { Exception } from '@adonisjs/core/exceptions'
import logger from '@adonisjs/core/services/logger'

export default class UsersController {
  async index({ response }: HttpContext) {
    try {
      const users = await UserService.list()
      return response.ok(users)
    } catch (error) {
      return this.handleError(error, response, 'Falha ao buscar usuários')
    }
  }

  async store({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(userCreateValidator)

      const isBlacklisted = await AuthService.isBlacklisted({
        email: payload.email,
        username: payload.username || payload.email,
      })

      if (isBlacklisted) {
        return response.forbidden({
          message: 'Este email ou username não pode ser utilizado',
        })
      }

      const user = await UserService.create(payload)
      return response.created(user)
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return response.unprocessableEntity({
          message: 'Erro de validação',
          errors: error.messages,
        })
      }

      return this.handleError(error, response, 'Falha ao criar usuário')
    }
  }

  async show({ params, response }: HttpContext) {
    try {
      const user = await UserService.findById(params.id)
      return response.ok(user.serialize())
    } catch (error) {
      if (error.status === 404) {
        return response.notFound({
          message: 'Usuário não encontrado',
        })
      }

      return this.handleError(error, response, 'Falha ao buscar usuário')
    }
  }

  async update({ params, request, response }: HttpContext) {
    try {
      const user = await UserService.findById(params.id)
      const payload = await request.validateUsing(userUpdateValidator)

      if (payload.email && payload.email !== user.email) {
        const isBlacklisted = await AuthService.isBlacklisted({
          email: payload.email,
          username: payload.email,
        })

        if (isBlacklisted) {
          return response.forbidden({
            message: 'Este email não pode ser utilizado',
          })
        }
      }

      const updatedUser = await AuthService.updateUser(user, payload)
      return response.ok(updatedUser)
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return response.unprocessableEntity({
          message: 'Erro de validação',
          errors: error.messages,
        })
      }

      if (error.status === 404) {
        return response.notFound({
          message: 'Usuário não encontrado',
        })
      }

      return this.handleError(error, response, 'Falha ao atualizar usuário')
    }
  }

  async destroy({ params, response }: HttpContext) {
    try {
      const user = await UserService.findById(params.id)

      if (user.isDeleted) {
        return response.badRequest({
          message: 'Usuário já foi anonimizado',
        })
      }

      await AuthService.anonymizeUser(user)

      return response.noContent()
    } catch (error) {
      if (error.status === 404) {
        return response.notFound({
          message: 'Usuário não encontrado',
        })
      }

      return this.handleError(error, response, 'Falha ao deletar usuário')
    }
  }

  async destroy_register({ params, response }: HttpContext) {
    try {
      const user = await UserService.findById(params.id)

      await UserService.delete(user)

      return response.ok({
        message: 'Usuário anonimizado com sucesso',
      })
    } catch (error) {
      if (error.status === 404) {
        return response.notFound({
          message: 'Usuário não encontrado',
        })
      }

      return this.handleError(error, response, 'Falha ao anonimizar usuário')
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
