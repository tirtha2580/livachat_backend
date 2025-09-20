require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const chatRoutes = require('./routes/chat');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' }});

// make io available in req.app.get('io')
app.set('io', io);

// ====== Socket Auth + Rooms ======
io.use((socket, next) => {
  try {
    // token can come from handshake.auth.token or query.token
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Unauthorized'));

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = String(payload.id);
    return next();
  } catch (err) {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  socket.join(userId); // user room
  console.log(`🔌 User connected ${userId} (socket ${socket.id})`);

  // Notify all users that someone came online
  io.emit("userOnline", { userId });

  // typing indicators for a conversation
  socket.on('typing', ({ conversationId }) => {
    socket.to(conversationId).emit('typing', { conversationId, userId });
  });

  socket.on('stopTyping', ({ conversationId }) => {
    socket.to(conversationId).emit('stopTyping', { conversationId, userId });
  });

  // join conversation room (for faster broadcasting)
  socket.on('joinConversation', ({ conversationId }) => {
    if (mongoose.Types.ObjectId.isValid(conversationId)) {
      socket.join(conversationId);
      console.log(`${socket.id} joined conversation ${conversationId}`);
    }
  });

  socket.on('leaveConversation', ({ conversationId }) => {
    socket.leave(conversationId);
  });

  // send group/conversation message
  socket.on("sendGroupMessage", ({ conversationId, sender, content }) => {
    const message = {
      sender,
      content,
      type: "text",
      createdAt: new Date(),
    };

    // broadcast to conversation room
    io.to(conversationId).emit("receiveGroupMessage", message);

    // send notification (only to others in conversation)
    socket.to(conversationId).emit("notification", {
      type: "message",
      conversationId,
      sender,
      message: content,
      createdAt: new Date(),
    });
  });

  // send reaction
  socket.on("sendReaction", ({ conversationId, messageId, reaction, user }) => {
    io.to(conversationId).emit("receiveReaction", { messageId, reaction, user });

    // notification for reaction
    socket.to(conversationId).emit("notification", {
      type: "reaction",
      conversationId,
      messageId,
      user,
      reaction,
      createdAt: new Date(),
    });
  });

  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected ${userId} (socket ${socket.id})`);
    // Notify others user went offline
    io.emit("userOffline", { userId });
  });
});

// ====== Express Middleware & Routes ======
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);

connectDB();

app.get('/', (req, res) => res.send('Server is running'));

const PORT = process.env.PORT || 3500;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));