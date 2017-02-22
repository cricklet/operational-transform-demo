/* @flow */

import { TextApplier } from '../ot/applier.js'
import { OTHelper } from '../controllers/ot_helper.js'
import { OTServerHelper } from '../controllers/ot_server_helper.js'
import { setupServerConnection } from '../network/websockets_server_connection.js'

let server = new OTServerHelper(new OTHelper(TextApplier))
setupServerConnection(8123, server, console.log)
