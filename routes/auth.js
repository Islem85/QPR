const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const projects = require('../data/projects.json');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const SALT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, project_code: user.project_code },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, confirmPassword, projectCode } = req.body;

  if (!email || !password || !confirmPassword || !projectCode) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: 'Email invalide.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 8 caractères).' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Les mots de passe ne correspondent pas.' });
  }
  if (!projects.find(p => p.code === projectCode)) {
    return res.status(400).json({ error: 'Projet invalide.' });
  }

  const lEmail = email.toLowerCase();
  if (db.findUserByEmail(lEmail)) {
    return res.status(409).json({ error: 'Email déjà utilisé.' });
  }

  // First user for this project → coordinateur, otherwise → collaborateur
  const role = db.hasCoordinateurForProject(projectCode) ? 'collaborateur' : 'coordinateur';

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = db.createUser(lEmail, hash, role, projectCode);

  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, project_code: user.project_code } });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  const user = db.findUserByEmail(email.toLowerCase());
  const ERR = 'Identifiants incorrects.';
  if (!user) return res.status(401).json({ error: ERR });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: ERR });

  const token = signToken(user);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, project_code: user.project_code } });
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user: { id: user.id, email: user.email, role: user.role, project_code: user.project_code } });
});

// GET /api/auth/users — coordinateur only, scoped to their project
router.get('/users', verifyToken, requireRole('coordinateur'), (req, res) => {
  const me = db.findUserById(req.user.id);
  const users = me && me.project_code
    ? db.getUsersByProject(me.project_code)
    : [];
  res.json({ users });
});

// PATCH /api/auth/users/:id/role — coordinateur only, same project
router.patch('/users/:id/role', verifyToken, requireRole('coordinateur'), (req, res) => {
  const { role } = req.body;
  if (!['coordinateur', 'collaborateur'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide.' });
  }
  const me = db.findUserById(req.user.id);
  const id = parseInt(req.params.id, 10);
  const target = db.findUserById(id);
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (target.project_code !== me.project_code) return res.status(403).json({ error: 'Accès refusé.' });

  // Prevent a coordinator from demoting themselves if they are the only coordinator
  if (target.id === me.id && role === 'collaborateur') {
    const others = db.getUsersByProject(me.project_code).filter(u => u.role === 'coordinateur' && u.id !== me.id);
    if (others.length === 0) {
      return res.status(400).json({ error: 'Impossible : vous êtes le seul coordinateur du projet.' });
    }
  }

  db.updateUserRole(id, role);
  res.json({ success: true });
});

module.exports = router;
