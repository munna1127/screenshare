const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static("public"));

io.on("connection", socket => {

  socket.on("join-room", ({ room, username }) => {
    socket.join(room);

    socket.username = username;

    const users = Array.from(io.sockets.adapter.rooms.get(room) || []);

    users.forEach(userId => {
      if (userId !== socket.id) {
        socket.emit("user-joined", {
          userId,
          username: io.sockets.sockets.get(userId)?.username || "User"
        });
      }
    });

    socket.to(room).emit("user-joined", {
      userId: socket.id,
      username
    });

    socket.on("signal", ({ userId, data }) => {
      io.to(userId).emit("signal", {
        userId: socket.id,
        data
      });
    });

    socket.on("chat", msg => {
      io.to(room).emit("chat", msg);
    });

  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running...");
});
