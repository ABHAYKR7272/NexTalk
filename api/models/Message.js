const mongoose = require('mongoose');
const messageSchema = new mongoose.Schema({
  conversationId: { type:mongoose.Schema.Types.ObjectId, ref:'Conversation', required:true, index:true },
  sender:         { type:mongoose.Schema.Types.ObjectId, ref:'User',         required:true },
  type:           { type:String, enum:['text','image','video','file','call_log'], default:'text' },
  content:        { type:String, default:'' },
  fileUrl:        { type:String, default:'' },
  fileSize:       { type:String, default:'' },
  callDuration:   { type:Number, default:0  },
  callType:       { type:String, default:'' },
  isRead:         { type:Boolean, default:false },
  unsent:         { type:Boolean, default:false },
  deletedFor:     [{ type:mongoose.Schema.Types.ObjectId, ref:'User' }],
}, { timestamps:true });
module.exports = mongoose.model('Message', messageSchema);
