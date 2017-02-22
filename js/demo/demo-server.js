/* @flow */

import { OTServerHelper } from '../controllers/ot_server_helper.js'
import { setupServerConnection } from '../network/websockets_server_connection.js'

let server = new OTServerHelper()
setupServerConnection(8123, server, console.log)
