const mongoose = require('mongoose');

const liveUserSchema = new mongoose.Schema({
  balance: { type: Number, required: true },
  email: { type: String, required: true },
  key: { type: String, required: true },
  password: { type: String, required: true },
  userCallId: { type: String, required: true },
  userName: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
});

const LiveUser = mongoose.model('LiveUser', liveUserSchema);

module.exports = LiveUser;
