/* @flow */

import { TextApplier } from '../ot/applier.js'
import { OTHelper } from '../controllers/ot_helper.js'
import { ServerController } from '../controllers/server_controller.js'
import { setupServerConnection } from '../network/websockets_server_connection.js'

let serverController = new ServerController(new OTHelper(TextApplier))
setupServerConnection(8123, serverController, console.log)
