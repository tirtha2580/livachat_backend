const mongoose = require('mongoose');
const { Schema } = mongoose;

const conversationSchema = new Schema({
  isGroup: { type: Boolean, default: false },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }], // for DM and groups
  groupName: { type: String },
  groupAvatar: { type: String },
  admins: [{ type: Schema.Types.ObjectId, ref: 'User' }], // only for groups
  lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
}, { timestamps: true });

// Helpful index for DM lookups
conversationSchema.index({ isGroup: 1, participants: 1 });

module.exports = mongoose.model('Conversation', conversationSchema);
