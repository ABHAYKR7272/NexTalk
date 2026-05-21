const express      = require('express');
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');
const User         = require('../models/User');
const Message      = require('../models/Message');
const Conversation = require('../models/Conversation');
const { protect }  = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

// ── Multer ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|gif|webp|mp4|mov|avi|pdf|doc|docx|zip|txt)$/i.test(file.originalname);
    ok ? cb(null, true) : cb(new Error('File type not allowed'));
  },
});

// ── Helper ────────────────────────────────────────────────
async function getOrCreateConv(a, b) {
  let c = await Conversation.findOne({ participants: { $all: [a, b], $size: 2 } });
  if (!c) c = await Conversation.create({ participants: [a, b] });
  return c;
}

// GET /api/messages/conversations
router.get('/conversations', async (req, res) => {
  try {
    const convs = await Conversation.find({ participants: req.user._id })
      .populate({ path: 'participants', select: 'username displayName avatar isOnline lastSeen' })
      .populate({ path: 'lastMessage', select: 'content type createdAt sender isRead' })
      .sort({ lastMessageAt: -1 });

    const result = convs
      .map(c => {
        const other = c.participants.find(p => p._id.toString() !== req.user._id.toString());
        if (!other) return null;
        return { _id: c._id, other, lastMessage: c.lastMessage, updatedAt: c.lastMessageAt };
      })
      .filter(Boolean);

    res.json({ success: true, conversations: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/messages/:userId
router.get('/:userId', async (req, res) => {
  try {
    const me    = req.user;
    const other = await User.findById(req.params.userId).select('blockedUsers isPrivate followers');
    if (!other) return res.status(404).json({ success: false, message: 'User not found' });

    const iBlocked   = me.blockedUsers.map(String).includes(req.params.userId);
    const theyBlocked = other.blockedUsers.map(String).includes(me._id.toString());
    if (iBlocked || theyBlocked) return res.status(403).json({ success: false, message: 'Cannot message this user' });

    const conv = await getOrCreateConv(me._id, req.params.userId);
    const msgs = await Message.find({
      conversationId: conv._id,
      deletedFor: { $nin: [me._id] },
    }).sort({ createdAt: 1 }).limit(100);

    await Message.updateMany(
      { conversationId: conv._id, sender: { $ne: me._id }, isRead: false },
      { isRead: true }
    );

    res.json({ success: true, messages: msgs, conversationId: conv._id });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/messages/:userId  (text)
router.post('/:userId', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Empty message' });

    const conv = await getOrCreateConv(req.user._id, req.params.userId);
    const msg  = await Message.create({
      conversationId: conv._id,
      sender:  req.user._id,
      type:    'text',
      content: content.trim(),
    });
    await Conversation.findByIdAndUpdate(conv._id, { lastMessage: msg._id, lastMessageAt: new Date() });
    res.status(201).json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/messages/:userId/upload
router.post('/:userId/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });

    const ext    = path.extname(req.file.originalname).toLowerCase();
    const imgExt = ['.jpg','.jpeg','.png','.gif','.webp'];
    const vidExt = ['.mp4','.mov','.avi'];
    const type   = imgExt.includes(ext) ? 'image' : vidExt.includes(ext) ? 'video' : 'file';

    const conv = await getOrCreateConv(req.user._id, req.params.userId);
    const msg  = await Message.create({
      conversationId: conv._id,
      sender:   req.user._id,
      type,
      content:  req.file.originalname,
      fileUrl:  req.file.filename,          // store ONLY filename
      fileSize: (req.file.size / 1024 > 1024)
        ? (req.file.size / 1048576).toFixed(1) + ' MB'
        : (req.file.size / 1024).toFixed(1) + ' KB',
    });
    await Conversation.findByIdAndUpdate(conv._id, { lastMessage: msg._id, lastMessageAt: new Date() });
    res.status(201).json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/messages/:id
// DELETE /api/messages/:id?mode=unsend|me
router.delete('/:id', async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ success:false, message:'Not found' });
    const mode = req.query.mode || 'me';
    if (mode === 'unsend') {
      if (msg.sender.toString() !== req.user._id.toString())
        return res.status(403).json({ success:false, message:'Only sender can unsend' });
      msg.unsent = true; msg.content = ''; msg.fileUrl = '';
      await msg.save();
    } else {
      await Message.findByIdAndUpdate(req.params.id, { $addToSet: { deletedFor: req.user._id } });
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
