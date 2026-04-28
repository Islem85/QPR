const express = require('express');
const db = require('../database');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/reports — list reports for current user's project
router.get('/', verifyToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user || !user.project_code) return res.json({ reports: [] });
  const reports = db.getReportsByProject(user.project_code);
  res.json({ reports });
});

// POST /api/reports — create a new draft
router.post('/', verifyToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user || !user.project_code) {
    return res.status(400).json({ error: 'Aucun projet associé à votre compte.' });
  }
  const { period_from, period_to, report_number, data } = req.body;
  const report = db.createReport({
    project_code: user.project_code,
    created_by_id: user.id,
    created_by_email: user.email,
    status: 'draft',
    period_from: period_from || '',
    period_to: period_to || '',
    report_number: report_number || '',
    data: data || {}
  });
  res.status(201).json({ report });
});

// PATCH /api/reports/:id — update a draft
router.patch('/:id', verifyToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.findUserById(req.user.id);
  const report = db.getReportById(id);
  if (!report) return res.status(404).json({ error: 'Rapport introuvable.' });
  if (report.project_code !== user.project_code) return res.status(403).json({ error: 'Accès refusé.' });
  if (report.status === 'submitted') return res.status(400).json({ error: 'Un rapport soumis ne peut pas être modifié.' });

  const { period_from, period_to, report_number, data } = req.body;
  const updated = db.updateReport(id, { period_from, period_to, report_number, data });
  res.json({ report: updated });
});

// POST /api/reports/:id/submit — coordinateur only
router.post('/:id/submit', verifyToken, requireRole('coordinateur'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.findUserById(req.user.id);
  const report = db.getReportById(id);
  if (!report) return res.status(404).json({ error: 'Rapport introuvable.' });
  if (report.project_code !== user.project_code) return res.status(403).json({ error: 'Accès refusé.' });
  if (report.status === 'submitted') return res.status(400).json({ error: 'Rapport déjà soumis.' });

  const submitted = db.submitReport(id);
  res.json({ report: submitted });
});

// POST /api/reports/:id/duplicate — coordinateur only
router.post('/:id/duplicate', verifyToken, requireRole('coordinateur'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.findUserById(req.user.id);
  const source = db.getReportById(id);
  if (!source) return res.status(404).json({ error: 'Rapport source introuvable.' });
  if (source.project_code !== user.project_code) return res.status(403).json({ error: 'Accès refusé.' });

  const copy = db.createReport({
    project_code: source.project_code,
    created_by_id: user.id,
    created_by_email: user.email,
    status: 'draft',
    period_from: '',
    period_to: '',
    report_number: '',
    data: JSON.parse(JSON.stringify(source.data)) // deep copy
  });
  res.status(201).json({ report: copy });
});

// DELETE /api/reports/:id — coordinateur only, only drafts
router.delete('/:id', verifyToken, requireRole('coordinateur'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.findUserById(req.user.id);
  const report = db.getReportById(id);
  if (!report) return res.status(404).json({ error: 'Rapport introuvable.' });
  if (report.project_code !== user.project_code) return res.status(403).json({ error: 'Accès refusé.' });
  if (report.status === 'submitted') return res.status(400).json({ error: 'Impossible de supprimer un rapport soumis.' });

  db.deleteReport(id);
  res.json({ success: true });
});

module.exports = router;
