// const mongoose = require('mongoose');
// const { Schema } = mongoose;

// const reactionSchema = new Schema({
//   user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
//   emoji: { type: String, required: true }, // store unicode emoji
// }, { _id: false });

// const messageSchema = new Schema({
//   conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
//   sender:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
//   type:         { type: String, enum: ['text'], default: 'text' },
//   content:      { type: String, required: true },
//   reactions:    [reactionSchema],
//   seenBy:       [{ type: Schema.Types.ObjectId, ref: 'User' }],
// }, { timestamps: true });

// messageSchema.index({ conversation: 1, createdAt: -1 });

// module.exports = mongoose.model('Message', messageSchema);


const mongoose = require('mongoose');
const { Schema } = mongoose;

const reactionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true }, // store unicode emoji
}, { _id: false });

const messageSchema = new Schema({
  conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type:         { type: String, enum: ['text'], default: 'text' },
  content:      { type: String, required: true }, // emojis are fine (unicode)
  reactions:    [reactionSchema],
  seenBy:       [{ type: Schema.Types.ObjectId, ref: 'User' }],
  expiresAt:    { type: Date } // new field
}, { timestamps: true });

messageSchema.index({ conversation: 1, createdAt: -1 });

// set expiresAt = createdAt + 240 days
messageSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date(this.createdAt.getTime() + 240 * 24 * 60 * 60 * 1000);
  }
  next();
});

module.exports = mongoose.model('Message', messageSchema);
