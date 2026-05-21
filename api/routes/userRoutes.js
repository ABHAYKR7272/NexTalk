const express = require('express');
const User    = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(protect);

// ── GET /api/users/search?q= ──────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success:true, users:[] });

    const me         = req.user;
    const myBlocked  = me.blockedUsers.map(String);

    const users = await User.find({
      $and: [
        { _id: { $ne: me._id } },
        { _id: { $nin: myBlocked } },
        { blockedUsers: { $nin: [me._id] } },
        { $or: [
          { username:    { $regex: q, $options:'i' } },
          { displayName: { $regex: q, $options:'i' } },
        ]},
      ],
    }).select('username displayName bio avatar isOnline followers isPrivate').limit(20);

    const meId = me._id.toString();
    const result = users.map(u => ({
      _id:          u._id,
      username:     u.username,
      avatar:       u.avatar,
      displayName:  u.displayName,
      bio:          u.bio,
      isOnline:     u.isOnline,
      isPrivate:    u.isPrivate,
      followersCount: u.followers.length,
      isFollowing:    u.followers.map(String).includes(meId),
      hasSentRequest: me.sentRequests.map(String).includes(u._id.toString()),
    }));

    res.json({ success:true, users: result });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── GET /api/users/me/pending-requests ───────────────────
router.get('/me/pending-requests', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('pendingRequests','username displayName isOnline');
    res.json({ success:true, requests: user.pendingRequests });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── GET /api/users/me/following ───────────────────────────
router.get('/me/following', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('following','username displayName isOnline');
    res.json({ success:true, following: user.following });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── GET /api/users/me/followers ───────────────────────────
router.get('/me/followers', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('followers','username displayName isOnline');
    res.json({ success:true, followers: user.followers });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── GET /api/users/:username ──────────────────────────────
router.get('/:username', async (req, res) => {
  try {
    const me   = req.user;
    const user = await User.findOne({ username: req.params.username.toLowerCase() })
      .select('-password -socketId');
    if (!user) return res.status(404).json({ success:false, message:'User not found.' });

    // Blocked check
    if (user.blockedUsers.map(String).includes(me._id.toString()) ||
        me.blockedUsers.map(String).includes(user._id.toString()))
      return res.status(403).json({ success:false, message:'Access denied.' });

    const meId = me._id.toString();
    const uid  = user._id.toString();

    res.json({ success:true, user: {
      _id:          user._id,
      username:     user.username,
      avatar:       user.avatar,
      displayName:  user.displayName,
      bio:          user.bio,
      isOnline:     user.isOnline,
      lastSeen:     user.lastSeen,
      isPrivate:    user.isPrivate,
      followers:    user.followers.length,
      following:    user.following.length,
      isFollowing:  user.followers.map(String).includes(meId),
      hasSentRequest: me.sentRequests.map(String).includes(uid),
      isBlocked:    me.blockedUsers.map(String).includes(uid),
      canMessage:   user.followers.map(String).includes(meId) || !user.isPrivate,
    }});
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── POST /api/users/:id/follow ────────────────────────────
router.post('/:id/follow', async (req, res) => {
  try {
    const tid = req.params.id;
    const me  = await User.findById(req.user._id);
    const target = await User.findById(tid);
    if (!target)                    return res.status(404).json({ success:false, message:'User not found.' });
    if (tid === me._id.toString())  return res.status(400).json({ success:false, message:'Cannot follow yourself.' });
    if (me.blockedUsers.map(String).includes(tid) || target.blockedUsers.map(String).includes(me._id.toString()))
      return res.status(403).json({ success:false, message:'Action not allowed.' });

    const alreadyFollowing = target.followers.map(String).includes(me._id.toString());

    if (alreadyFollowing) {
      // Unfollow
      await User.findByIdAndUpdate(tid,     { $pull:{ followers: me._id } });
      await User.findByIdAndUpdate(me._id,  { $pull:{ following: tid } });
      return res.json({ success:true, status:'none', message:'Unfollowed.' });
    }

    if (target.isPrivate) {
      const alreadySent = me.sentRequests.map(String).includes(tid);
      if (alreadySent) {
        // Cancel request
        await User.findByIdAndUpdate(me._id, { $pull:{ sentRequests:    tid     } });
        await User.findByIdAndUpdate(tid,    { $pull:{ pendingRequests: me._id  } });
        return res.json({ success:true, status:'none', message:'Request cancelled.' });
      }
      await User.findByIdAndUpdate(me._id, { $addToSet:{ sentRequests:    tid    } });
      await User.findByIdAndUpdate(tid,    { $addToSet:{ pendingRequests: me._id } });
      return res.json({ success:true, status:'requested', message:'Follow request sent.' });
    }

    // Public — follow directly
    await User.findByIdAndUpdate(tid,    { $addToSet:{ followers: me._id } });
    await User.findByIdAndUpdate(me._id, { $addToSet:{ following: tid    } });
    res.json({ success:true, status:'following', message:'Following @'+target.username });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── POST /api/users/:id/unfollow ──────────────────────────
router.post('/:id/unfollow', async (req, res) => {
  try {
    const tid = req.params.id;
    await User.findByIdAndUpdate(tid,         { $pull:{ followers: req.user._id } });
    await User.findByIdAndUpdate(req.user._id, { $pull:{ following: tid         } });
    res.json({ success:true, message:'Unfollowed.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── POST /api/users/:id/accept-request ───────────────────
router.post('/:id/accept-request', async (req, res) => {
  try {
    const rid = req.params.id;
    const me  = req.user;
    if (!me.pendingRequests.map(String).includes(rid))
      return res.status(400).json({ success:false, message:'No request found.' });
    await User.findByIdAndUpdate(me._id, { $pull:{ pendingRequests:rid     }, $addToSet:{ followers:rid    } });
    await User.findByIdAndUpdate(rid,    { $pull:{ sentRequests:me._id     }, $addToSet:{ following:me._id } });
    res.json({ success:true, message:'Request accepted.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── POST /api/users/:id/reject-request ───────────────────
router.post('/:id/reject-request', async (req, res) => {
  try {
    const rid = req.params.id;
    await User.findByIdAndUpdate(req.user._id, { $pull:{ pendingRequests: rid        } });
    await User.findByIdAndUpdate(rid,          { $pull:{ sentRequests:    req.user._id } });
    res.json({ success:true, message:'Request rejected.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── POST /api/users/:id/block ─────────────────────────────
router.post('/:id/block', async (req, res) => {
  try {
    const tid = req.params.id;
    const me  = req.user._id;
    await User.findByIdAndUpdate(me,  { $addToSet:{ blockedUsers:tid }, $pull:{ following:tid, followers:tid, sentRequests:tid, pendingRequests:tid } });
    await User.findByIdAndUpdate(tid, { $pull:{ following:me, followers:me, sentRequests:me, pendingRequests:me } });
    res.json({ success:true, message:'User blocked.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── POST /api/users/:id/unblock ───────────────────────────
router.post('/:id/unblock', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $pull:{ blockedUsers: req.params.id } });
    res.json({ success:true, message:'User unblocked.' });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
