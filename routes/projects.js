const express = require('express');
const projects = require('../data/projects.json');

const router = express.Router();

// Public — needed by the register screen before auth
router.get('/', (req, res) => {
  res.json({ projects });
});

module.exports = router;
