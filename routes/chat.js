const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const chat = require('../controllers/chatController');

// Conversations
router.post('/conversations/:otherUserId', authMiddleware, chat.createOrGetDM);
router.get('/conversations', authMiddleware, chat.listConversations);

// Messages
router.get('/messages/:conversationId', authMiddleware, chat.getMessages);
router.post('/messages', authMiddleware, chat.sendMessage);
router.post('/messages/:conversationId/read', authMiddleware, chat.markAsRead);
router.post('/messages/:messageId/reactions', authMiddleware, chat.addReaction);
router.delete('/messages/:messageId/reactions', authMiddleware, chat.removeReaction);

// Groups
router.post('/groups', authMiddleware, chat.createGroup);
router.put('/groups/:id', authMiddleware, chat.renameGroup);
router.post('/groups/:id/members', authMiddleware, chat.addMembers);
router.delete('/groups/:id/members/:memberId', authMiddleware, chat.removeMember);
router.post('/groups/:id/leave', authMiddleware, chat.leaveGroup);

module.exports = router;
