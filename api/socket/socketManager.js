const jwt          = require('jsonwebtoken');
const User         = require('../models/User');
const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');

const online = new Map();

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('No token'));
      const { id } = jwt.verify(token, process.env.JWT_SECRET);
      const user   = await User.findById(id).select('-password');
      if (!user)   return next(new Error('User not found'));
      socket.user  = user; next();
    } catch { next(new Error('Auth failed')); }
  });

  io.on('connection', async (socket) => {
    const uid = socket.user._id.toString();
    online.set(uid, socket.id);
    socket.join(uid);

    await User.findByIdAndUpdate(uid, { isOnline: true, socketId: socket.id });
    broadcastPresence(io, socket.user, true);

    socket.on('sendMessage', async ({ receiverId, content, type = 'text', fileUrl = '', fileSize = '' }) => {
      try {
        if (!content && !fileUrl) return;
        let conv = await Conversation.findOne({ participants: { $all: [uid, receiverId], $size: 2 } });
        if (!conv) conv = await Conversation.create({ participants: [uid, receiverId] });
        const msg = await Message.create({ conversationId: conv._id, sender: uid, type, content, fileUrl, fileSize });
        await Conversation.findByIdAndUpdate(conv._id, { lastMessage: msg._id, lastMessageAt: new Date() });
        const populated = await Message.findById(msg._id).populate('sender', 'username displayName avatar');
        io.to(receiverId).emit('newMessage', { message: populated });
        socket.emit('messageSent',           { message: populated, tempId: content });
      } catch (e) { socket.emit('err', { message: e.message }); }
    });

    // ── UNSEND (Instagram-style) ───────────────────────
    socket.on('unsendMessage', async ({ messageId, receiverId }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg || msg.sender.toString() !== uid) return;
        msg.unsent = true;
        msg.content = '';
        msg.fileUrl = '';
        await msg.save();
        io.to(receiverId).emit('messageUnsent', { messageId });
        socket.emit('messageUnsent', { messageId });
      } catch {}
    });

    socket.on('typing',     ({ receiverId }) => io.to(receiverId).emit('typing',     { senderId: uid }));
    socket.on('stopTyping', ({ receiverId }) => io.to(receiverId).emit('stopTyping', { senderId: uid }));

    socket.on('markRead', async ({ senderId }) => {
      try {
        const conv = await Conversation.findOne({ participants: { $all: [uid, senderId], $size: 2 } });
        if (!conv) return;
        await Message.updateMany({ conversationId: conv._id, sender: senderId, isRead: false }, { isRead: true });
        io.to(senderId).emit('messagesRead', { byUserId: uid });
      } catch {}
    });

    // ── WEBRTC ────────────────────────────────────────
    socket.on('callUser',     ({ targetId, callType, offer })  => io.to(targetId).emit('incomingCall',  { callerId: uid, callerName: socket.user.displayName, callType, offer }));
    socket.on('callAccepted', ({ callerId, answer })            => io.to(callerId).emit('callAnswered',  { answer, acceptorId: uid }));
    socket.on('callRejected', ({ callerId })                    => io.to(callerId).emit('callRejected',  { by: uid }));
    socket.on('iceCandidate', ({ targetId, candidate })         => io.to(targetId).emit('iceCandidate', { candidate, from: uid }));
    socket.on('endCall',      ({ targetId })                    => io.to(targetId).emit('callEnded',     { by: uid }));
    // Renegotiate after camera switch / type switch
    socket.on('renegotiate',  ({ targetId, offer })             => io.to(targetId).emit('renegotiate',  { offer, from: uid }));
    socket.on('renegotiateAnswer', ({ targetId, answer })       => io.to(targetId).emit('renegotiateAnswer', { answer, from: uid }));

    socket.on('notifyFollow',  ({ targetId }) => io.to(targetId).emit('followRequest',  { from: { _id: uid, username: socket.user.username, displayName: socket.user.displayName } }));
    socket.on('notifyAccept',  ({ toId })     => io.to(toId).emit('followAccepted',     { by:   { _id: uid, username: socket.user.username } }));

    socket.on('disconnect', async () => {
      online.delete(uid);
      await User.findByIdAndUpdate(uid, { isOnline: false, lastSeen: new Date(), socketId: '' });
      broadcastPresence(io, socket.user, false);
    });
  });
};

async function broadcastPresence(io, user, isOnline) {
  try {
    const u = await User.findById(user._id).select('followers');
    u?.followers.forEach(fid => {
      io.to(fid.toString()).emit('presence', { userId: user._id.toString(), isOnline, lastSeen: new Date() });
    });
  } catch {}
}
