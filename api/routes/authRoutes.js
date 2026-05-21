const express = require('express');
const jwt     = require('jsonwebtoken');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { body, validationResult } = require('express-validator');
const User    = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
const genToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ── Multer for avatars ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'av-' + Date.now() + '-' + Math.round(Math.random()*1e9) + ext);
  },
});
const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => /\.(jpe?g|png|gif|webp)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Image only')),
});

router.post('/register', [
  body('username').trim().isLength({ min:3, max:20 }).matches(/^[a-z0-9._]+$/).withMessage('Username: 3-20 chars, only letters/numbers/._'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min:6 }).withMessage('Password must be 6+ characters'),
  body('displayName').trim().notEmpty().withMessage('Display name required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ success:false, message: errs.array()[0].msg });
  try {
    const { username, email, password, displayName } = req.body;
    const exists = await User.findOne({ $or:[{ email: email.toLowerCase() },{ username: username.toLowerCase() }] });
    if (exists) return res.status(409).json({ success:false, message: (exists.email===email.toLowerCase() ? 'Email' : 'Username') + ' already taken.' });
    const user  = await User.create({ username: username.toLowerCase(), email: email.toLowerCase(), password, displayName });
    res.status(201).json({ success:true, token: genToken(user._id), user: user.toPublicJSON() });
  } catch(e) { res.status(500).json({ success:false, message: e.message }); }
});

router.post('/login', [
  body('login').trim().notEmpty().withMessage('Username or email required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  const errs = validationResult(req);
  if (!errs.isEmpty()) return res.status(400).json({ success:false, message: errs.array()[0].msg });
  try {
    const { login, password } = req.body;
    const user = await User.findOne({ $or:[{ email: login.toLowerCase() },{ username: login.toLowerCase() }] });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success:false, message: 'Wrong username/email or password.' });
    res.json({ success:true, token: genToken(user._id), user: user.toPublicJSON() });
  } catch(e) { res.status(500).json({ success:false, message: e.message }); }
});

router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('pendingRequests', 'username displayName avatar');
    res.json({ success:true, user: { ...user.toPublicJSON(), pendingRequests: user.pendingRequests } });
  } catch(e) { res.status(500).json({ success:false, message: e.message }); }
});

router.put('/update-profile', protect, async (req, res) => {
  try {
    const { displayName, bio, isPrivate } = req.body;
    if (!displayName?.trim()) return res.status(400).json({ success:false, message:'Display name required' });
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { displayName: displayName.trim(), bio: (bio||'').trim(), isPrivate: !!isPrivate },
      { new:true, runValidators:true }
    );
    res.json({ success:true, user: user.toPublicJSON() });
  } catch(e) { res.status(500).json({ success:false, message: e.message }); }
});

// ── POST /api/auth/upload-avatar ─────────────────────────
router.post('/upload-avatar', protect, avatarUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success:false, message:'No file' });
    // remove old avatar (if local file)
    if (req.user.avatar && !/^https?:/.test(req.user.avatar)) {
      const old = path.join(__dirname, '../uploads', req.user.avatar);
      fs.existsSync(old) && fs.unlink(old, () => {});
    }
    const user = await User.findByIdAndUpdate(req.user._id, { avatar: req.file.filename }, { new:true });
    res.json({ success:true, user: user.toPublicJSON() });
  } catch(e) { res.status(500).json({ success:false, message: e.message }); }
});

router.delete('/delete-account', protect, async (req, res) => {
  try {
    const uid = req.user._id;
    await User.updateMany(
      { $or:[{ followers:uid },{ following:uid },{ pendingRequests:uid },{ sentRequests:uid }] },
      { $pull:{ followers:uid, following:uid, pendingRequests:uid, sentRequests:uid } }
    );
    await User.findByIdAndDelete(uid);
    res.json({ success:true, message:'Account deleted.' });
  } catch(e) { res.status(500).json({ success:false, message: e.message }); }
});

module.exports = router;
