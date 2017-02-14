import SockJS from 'sockjs-client'

let WS_HOST = 'localhost'
let WS_PORT = 8001
let WS_URL = `http://${WS_HOST}:${WS_PORT}`

var sock = new SockJS(`${WS_URL}/echo`);

sock.onopen = function() {
  console.log('connection opened');
  sock.send('test');
};
sock.onmessage = function(e) {
  console.log('received:', e.data);
};
sock.onclose = function() {
  console.log('connection closed');
};
