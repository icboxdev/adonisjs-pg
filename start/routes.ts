/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'
import { middleware } from './kernel.js'

import '#routes/app_routes_v1'
import '#routes/sys_routes_v1'
import '#routes/app_test'
import '#routes/webhook_routes_v1'

router.where('id', router.matchers.number())

router.get('/', async () => {
  return { online: true }
})

transmit.registerRoutes((route) => {
  if (route.getPattern() === '/__transmit/events') {
    route.middleware(middleware.auth())
    return
  }
})
