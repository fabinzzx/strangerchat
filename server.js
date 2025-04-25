const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));

const users = new Map(); // socket.id -> { partnerId, room }
let queue = [];

function pairUsers() {
  while (queue.length >= 2) {
    const socket1 = queue.shift();
    const socket2 = queue.shift();
    const room = `room-${socket1.id}-${socket2.id}`;
    socket1.join(room);
    socket2.join(room);

    users.set(socket1.id, { partnerId: socket2.id, room });
    users.set(socket2.id, { partnerId: socket1.id, room });
    socket1.emit('chat_started', { room, isInitiator: true });
    socket2.emit('chat_started', { room, isInitiator: false });

  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  queue.push(socket);
  pairUsers();

  socket.on('message', (data) => {
    const partner = users.get(socket.id)?.partnerId;
    if (partner) {
      io.to(users.get(socket.id).room).emit('message', { msg: data.msg, from: socket.id });
    }
  });

  socket.on('typing', () => {
    const partner = users.get(socket.id)?.partnerId;
    if (partner) {
      io.to(partner).emit('typing');
    }
  });

  socket.on('next', () => {
    const partnerId = users.get(socket.id)?.partnerId;
    const partnerSocket = io.sockets.sockets.get(partnerId);

    // Remove old pairing
    if (partnerSocket) {
      partnerSocket.leave(users.get(partnerId).room);
      partnerSocket.emit('stranger_left');
      queue.push(partnerSocket);
    }

    socket.leave(users.get(socket.id)?.room);
    socket.emit('stranger_left');
    users.delete(partnerId);
    users.delete(socket.id);
    queue.push(socket);
    pairUsers();
  });

  socket.on('disconnect', () => {
    const partnerId = users.get(socket.id)?.partnerId;
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.leave(users.get(partnerId).room);
      partnerSocket.emit('stranger_left');
      queue.push(partnerSocket);
    }
    users.delete(partnerId);
    users.delete(socket.id);
    queue = queue.filter(s => s.id !== socket.id);
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
