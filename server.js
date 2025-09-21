require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const chatRoutes = require("./routes/chat");

const app = express();
const server = http.createServer(app);

// ===== Allowed Origins =====
const allowedOrigins = [
  "http://localhost:5173",             // frontend dev
  "https://your-frontend-domain.com",  // replace with deployed frontend
];

// ===== Express Middleware =====
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

// ===== Routes =====
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);

// ====== Socket.IO ======
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// make io available in req.app
app.set("io", io);

// ===== Socket Auth + Rooms =====
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Unauthorized"));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = String(payload.id);
    return next();
  } catch (err) {
    return next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.userId;
  socket.join(userId);
  console.log(`🔌 User connected ${userId} (socket ${socket.id})`);

  io.emit("userOnline", { userId });

  socket.on("typing", ({ conversationId }) => {
    socket.to(conversationId).emit("typing", { conversationId, userId });
  });

  socket.on("stopTyping", ({ conversationId }) => {
    socket.to(conversationId).emit("stopTyping", { conversationId, userId });
  });

  socket.on("joinConversation", ({ conversationId }) => {
    if (mongoose.Types.ObjectId.isValid(conversationId)) {
      socket.join(conversationId);
      console.log(`${socket.id} joined conversation ${conversationId}`);
    }
  });

  socket.on("leaveConversation", ({ conversationId }) => {
    socket.leave(conversationId);
  });

  socket.on("sendGroupMessage", ({ conversationId, sender, content }) => {
    const message = {
      sender,
      content,
      type: "text",
      createdAt: new Date(),
    };

    io.to(conversationId).emit("receiveGroupMessage", message);

    socket.to(conversationId).emit("notification", {
      type: "message",
      conversationId,
      sender,
      message: content,
      createdAt: new Date(),
    });
  });

  socket.on("sendReaction", ({ conversationId, messageId, reaction, user }) => {
    io.to(conversationId).emit("receiveReaction", { messageId, reaction, user });

    socket.to(conversationId).emit("notification", {
      type: "reaction",
      conversationId,
      messageId,
      user,
      reaction,
      createdAt: new Date(),
    });
  });

  socket.on("disconnect", () => {
    console.log(`🔌 User disconnected ${userId} (socket ${socket.id})`);
    io.emit("userOffline", { userId });
  });
});

// ====== Database & Server ======
connectDB();
app.get("/", (req, res) => res.send("Server is running"));

const PORT = process.env.PORT || 3500;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
