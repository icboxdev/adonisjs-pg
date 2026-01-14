import AppKeysController from '#controllers/app_keys_controller'
import AppsController from '#controllers/apps_controller'
import AuthController from '#controllers/auth_controller'
import UsersController from '#controllers/users_controller'
import { UserRole } from '#services/auth/role_service'
import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

router
  .group(() => {
    router.post('email/send', [AppsController, 'sendEmail']).middleware(middleware.authRole(UserRole.USER))
    router.post('login', [AuthController, 'login'])
    router.post('password/reset-request', [AuthController, 'requestPasswordReset' ])
    router.post('password/reset', [AuthController, 'resetPassword'])

    router
      .group(() => {
        router.post('logout', [AuthController, 'logout'])
        router.post('revoke', [AuthController, 'revokeAll'])
        router.get('me', [AuthController, 'me'])
        router.put('me', [AuthController, 'updateMe'])
        router.post('email/verify', [AuthController, 'verifyEmail'])
        router.post('email/verify-request', [AuthController, 'requestEmailVerification'])
      })
      .prefix('auth')
      .middleware(middleware.authRole(UserRole.VIEW))

    router
      .group(() => {
        router.resource('users', UsersController).apiOnly().as('admin.users')
        router.resource('keys', AppKeysController).apiOnly().as('admin.keys')
      })
      .prefix('admin')
      // .middleware(middleware.authRole(UserRole.ADMIN))
  })
  .prefix('api/v1')
