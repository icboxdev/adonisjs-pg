/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

import '#routes/app_routes_v1'
import '#routes/sys_routes_v1'
import '#routes/app_test'
import '#routes/webhook_routes_v1'

router.where('id', router.matchers.number())

router.get('/', async () => {
  return { online: true }
})