/* @flow */

import { TextApplier } from '../ot/applier.js'
import { OTServerModel } from '../models/ot_server_model.js'
import { setupServerController } from '../controllers/websockets_server_controller.js'

let server = new OTServerModel()
setupServerController(8123, server, console.log)
