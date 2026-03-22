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

  socket.on("join-room", room => {
    socket.join(room);

    socket.to(room).emit("user-joined", socket.id);

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
