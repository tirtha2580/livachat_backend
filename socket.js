io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Track users with a map
  const userId = socket.handshake.query.userId; // send userId from frontend when connecting
  socket.userId = userId;

  // Notify all users that someone came online
  io.emit("userOnline", { userId });

  // join group room
  socket.on("joinGroup", (groupId) => {
    socket.join(groupId);
    console.log(`${socket.id} joined group ${groupId}`);
  });

  // send group message
  socket.on("sendGroupMessage", ({ groupId, sender, content }) => {
    const message = {
      sender,
      content,
      type: "text",
      createdAt: new Date(),
    };

    // broadcast to group
    io.to(groupId).emit("receiveGroupMessage", message);

    // send notification (only to others in group)
    socket.to(groupId).emit("notification", {
      type: "message",
      groupId,
      sender,
      message: content,
      createdAt: new Date(),
    });
  });

  // send reaction
  socket.on("sendReaction", ({ groupId, messageId, reaction, user }) => {
    io.to(groupId).emit("receiveReaction", { messageId, reaction, user });

    // notification for reaction
    socket.to(groupId).emit("notification", {
      type: "reaction",
      groupId,
      messageId,
      user,
      reaction,
      createdAt: new Date(),
    });
  });

  // When user disconnects
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Notify others user went offline
    io.emit("userOffline", { userId });
  });
});
