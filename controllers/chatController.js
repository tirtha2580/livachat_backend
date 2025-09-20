const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const mongoose = require('mongoose');

// Helper: emit to all user rooms
const emitToUsers = (io, userIds, event, payload, exceptUserId) => {
  (userIds || []).forEach(uid => {
    if (exceptUserId && String(uid) === String(exceptUserId)) return;
    io.to(String(uid)).emit(event, payload);
  });
};

/**
 * Create or get a 1:1 conversation
 * POST /api/chat/conversations/:otherUserId
 */
exports.createOrGetDM = async (req, res) => {
  const userId = req.user.id;
  const { otherUserId } = req.params;

  if (String(userId) === String(otherUserId)) {
    return res.status(400).json({ message: 'Cannot DM yourself' });
  }

  // Find existing DM with both participants
  let convo = await Conversation.findOne({
    isGroup: false,
    participants: { $all: [userId, otherUserId] },
    $expr: { $eq: [{ $size: '$participants' }, 2] }
  });

  if (!convo) {
    convo = await Conversation.create({
      isGroup: false,
      participants: [userId, otherUserId]
    });
  }

  res.json(convo);
};

/**
 * List user conversations (DM + groups)
 * GET /api/chat/conversations
 */
exports.listConversations = async (req, res) => {
  const userId = req.user.id;

  const convos = await Conversation.find({
    participants: userId
  })
    .populate('lastMessage')
    .populate('participants', 'username email')
    .sort({ updatedAt: -1 });

  res.json(convos);
};

/**
 * Get messages (paged)
 * GET /api/chat/messages/:conversationId?page=1&limit=20
 */
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const skip = (page - 1) * limit;

    // Validate conversationId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID format' });
    }

    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not a participant' });
    }

    const [items, total] = await Promise.all([
      Message.find({ conversation: conversationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'username email'),
      Message.countDocuments({ conversation: conversationId })
    ]);

    res.json({
      page,
      limit,
      total,
      messages: items.reverse() // chronological
    });
  } catch (err) {
    console.error('Error in getMessages:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Send message (REST)
 * POST /api/chat/messages
 * body: { conversationId, content }
 * Emits: "message:new"
 */
exports.sendMessage = async (req, res) => {
  const io = req.app.get('io');
  const userId = req.user.id;
  const { conversationId, content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({ message: 'Invalid conversation ID format' });
  }

  if (!content || !content.trim()) {
    return res.status(400).json({ message: 'Message content required' });
  }

  const convo = await Conversation.findById(conversationId);
  if (!convo) return res.status(404).json({ message: 'Conversation not found' });
  if (!convo.participants.map(String).includes(String(userId))) {
    return res.status(403).json({ message: 'Not a participant' });
  }

  const msg = await Message.create({
    conversation: conversationId,
    sender: userId,
    content: content.trim(),
    seenBy: [userId]
  });

  // Update lastMessage + bump updatedAt
  convo.lastMessage = msg._id;
  await convo.save();

  const payload = await Message.findById(msg._id)
    .populate('sender', 'username email');

  emitToUsers(io, convo.participants, 'notification:new', {
    conversationId,
    message: payload,
    sender: payload.sender
  }, userId);

  res.status(201).json(payload);
};

/**
 * Mark messages in a conversation as read by current user
 * POST /api/chat/messages/:conversationId/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const io = req.app.get('io');
    const userId = req.user.id;
    const { conversationId } = req.params;

    // Validate conversationId
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ message: 'Invalid conversation ID format' });
    }

    const convo = await Conversation.findById(conversationId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    if (!convo.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not a participant' });
    }

    await Message.updateMany(
      { conversation: conversationId, seenBy: { $ne: userId } },
      { $addToSet: { seenBy: userId } }
    );

    emitToUsers(io, convo.participants, 'message:read', {
      conversationId,
      userId
    }, userId);

    res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('Error in markAsRead:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * React to a message (emoji)
 * POST /api/chat/messages/:messageId/reactions  { emoji }
 * Emits: "message:reaction"
 */
exports.addReaction = async (req, res) => {
  const io = req.app.get('io');
  const userId = req.user.id;
  const { messageId } = req.params;
  const { emoji } = req.body;

  if (!emoji) return res.status(400).json({ message: 'Emoji required' });

  const msg = await Message.findById(messageId).populate('conversation');
  if (!msg) return res.status(404).json({ message: 'Message not found' });

  const convo = msg.conversation;
  if (!convo.participants.map(String).includes(String(userId))) {
    return res.status(403).json({ message: 'Not a participant' });
  }

  // Upsert reaction (one per user)
  const index = msg.reactions.findIndex(r => String(r.user) === String(userId));
  if (index >= 0) msg.reactions[index].emoji = emoji;
  else msg.reactions.push({ user: userId, emoji });

  await msg.save();

  emitToUsers(io, convo.participants, 'message:reaction', {
    messageId,
    userId,
    emoji
  }, userId);

  res.json({ message: 'Reaction updated', reactions: msg.reactions });
};

/**
 * Remove your reaction
 * DELETE /api/chat/messages/:messageId/reactions
 */
exports.removeReaction = async (req, res) => {
  const io = req.app.get('io');
  const userId = req.user.id;
  const { messageId } = req.params;

  const msg = await Message.findById(messageId).populate('conversation');
  if (!msg) return res.status(404).json({ message: 'Message not found' });

  const convo = msg.conversation;
  if (!convo.participants.map(String).includes(String(userId))) {
    return res.status(403).json({ message: 'Not a participant' });
  }

  msg.reactions = msg.reactions.filter(r => String(r.user) !== String(userId));
  await msg.save();

  emitToUsers(io, convo.participants, 'message:reactionRemoved', {
    messageId,
    userId
  }, userId);

  res.json({ message: 'Reaction removed', reactions: msg.reactions });
};

/**
 * Create group
 * POST /api/chat/groups   { name, members: [userIds] }
 */
exports.createGroup = async (req, res) => {
  const userId = req.user.id;
  const { name, members = [] } = req.body;

  const uniqueMembers = Array.from(new Set([ ...members.map(String), String(userId) ])).map(id => new mongoose.Types.ObjectId(id));
  if (!name || uniqueMembers.length < 2) {
    return res.status(400).json({ message: 'Group name and at least 2 members required' });
  }

  const group = await Conversation.create({
    isGroup: true,
    groupName: name,
    participants: uniqueMembers,
    admins: [userId]
  });

  res.status(201).json(group);
};

/**
 * Rename group
 * PUT /api/chat/groups/:id   { name }
 */
exports.renameGroup = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { name } = req.body;

  const group = await Conversation.findById(id);
  if (!group || !group.isGroup) return res.status(404).json({ message: 'Group not found' });
  if (!group.admins.map(String).includes(String(userId))) {
    return res.status(403).json({ message: 'Only admins can rename group' });
  }

  group.groupName = name || group.groupName;
  await group.save();

  res.json(group);
};

/**
 * Add members
 * POST /api/chat/groups/:id/members   { members: [userIds] }
 */
exports.addMembers = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { members = [] } = req.body;

  const group = await Conversation.findById(id);
  if (!group || !group.isGroup) return res.status(404).json({ message: 'Group not found' });
  if (!group.admins.map(String).includes(String(userId))) {
    return res.status(403).json({ message: 'Only admins can add members' });
  }

  const toAdd = members.map(String);
  const updated = Array.from(new Set([ ...group.participants.map(String), ...toAdd ])).map(x => new mongoose.Types.ObjectId(x));
  group.participants = updated;
  await group.save();

  res.json(group);
};

/**
 * Remove a member
 * DELETE /api/chat/groups/:id/members/:memberId
 */
exports.removeMember = async (req, res) => {
  const userId = req.user.id;
  const { id, memberId } = req.params;

  const group = await Conversation.findById(id);
  if (!group || !group.isGroup) return res.status(404).json({ message: 'Group not found' });
  if (!group.admins.map(String).includes(String(userId))) {
    return res.status(403).json({ message: 'Only admins can remove members' });
  }
  if (String(memberId) === String(userId) && group.admins.length === 1) {
    return res.status(400).json({ message: 'Cannot remove the last admin; assign another admin first' });
  }

  group.participants = group.participants.filter(p => String(p) !== String(memberId));
  group.admins = group.admins.filter(a => String(a) !== String(memberId));
  await group.save();

  res.json(group);
};

/**
 * Leave group
 * POST /api/chat/groups/:id/leave
 */
exports.leaveGroup = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const group = await Conversation.findById(id);
  if (!group || !group.isGroup) return res.status(404).json({ message: 'Group not found' });

  // If user is the last admin, block leaving unless there is another admin
  if (group.admins.map(String).includes(String(userId)) && group.admins.length === 1) {
    return res.status(400).json({ message: 'Assign another admin before leaving' });
  }

  group.participants = group.participants.filter(p => String(p) !== String(userId));
  group.admins = group.admins.filter(a => String(a) !== String(userId));
  await group.save();

  res.json({ message: 'Left group' });
};