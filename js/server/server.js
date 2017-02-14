import http from 'http'
import * as sockjs from 'sockjs';

let HOST = '0.0.0.0'
let PORT = 8001
let URL = `ws://${HOST}:${PORT}`

let echo = sockjs.createServer({ sockjs_url: "http://cdn.jsdelivr.net/sockjs/1.0.1/sockjs.min.js" });

echo.on('connection', (conn) => {
    conn.on('data', (message) => {
        conn.write(message);
    });
    conn.on('close', () => {});
});

let server = http.createServer();
echo.installHandlers(server, { prefix: '/echo' });

server.listen(PORT, HOST)
console.log(`Server running at ${URL}`)
