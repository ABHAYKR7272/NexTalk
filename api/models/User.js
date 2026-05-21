const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username:        { type:String, required:true, unique:true, lowercase:true, trim:true, minlength:3, maxlength:20 },
  email:           { type:String, required:true, unique:true, lowercase:true, trim:true },
  password:        { type:String, required:true, minlength:6 },
  displayName:     { type:String, required:true, trim:true, maxlength:40 },
  bio:             { type:String, default:'', maxlength:150 },
  avatar:          { type:String, default:'' }, // filename in uploads/ (or full URL)
  followers:       [{ type:mongoose.Schema.Types.ObjectId, ref:'User' }],
  following:       [{ type:mongoose.Schema.Types.ObjectId, ref:'User' }],
  pendingRequests: [{ type:mongoose.Schema.Types.ObjectId, ref:'User' }],
  sentRequests:    [{ type:mongoose.Schema.Types.ObjectId, ref:'User' }],
  blockedUsers:    [{ type:mongoose.Schema.Types.ObjectId, ref:'User' }],
  isPrivate:       { type:Boolean, default:false },
  isOnline:        { type:Boolean, default:false },
  lastSeen:        { type:Date,    default:Date.now },
  socketId:        { type:String,  default:'' },
}, { timestamps:true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = function(p){ return bcrypt.compare(p, this.password); };
userSchema.methods.toPublicJSON = function() {
  return {
    _id: this._id, username: this.username, displayName: this.displayName,
    bio: this.bio, avatar: this.avatar, isOnline: this.isOnline,
    lastSeen: this.lastSeen, isPrivate: this.isPrivate,
    followers: this.followers.length, following: this.following.length,
  };
};
module.exports = mongoose.model('User', userSchema);
