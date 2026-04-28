const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/qpr/submit — coordinateur only (server-side enforcement)
router.post('/submit', verifyToken, requireRole('coordinateur'), (req, res) => {
  // Submission logic (email, storage, etc.) can be added here
  res.json({ success: true, message: 'QPR submitted successfully' });
});

module.exports = router;
