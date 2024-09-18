const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  callId: { type: String, required: true, unique: true },
  lastUpdated: { type: Date, default: Date.now },
  status: { type: String, required: true }
});

const Call = mongoose.model('Call', callSchema);

module.exports = Call;
