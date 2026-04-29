const express = require('express');
const db = require('../database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { generateReport } = require('../services/wordgen');
const { sendSubmissionEmail } = require('../services/mailer');
const sapFull = require('../data/sap_full.json');

const router = express.Router();

// GET /api/reports
router.get('/', verifyToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user || !user.project_code) return res.json({ reports: [] });
  res.json({ reports: db.getReportsByProject(user.project_code) });
});

// POST /api/reports — create draft
router.post('/', verifyToken, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user || !user.project_code) return res.status(400).json({ error: 'Aucun projet associé à votre compte.' });

  const { period_from, period_to, report_number, quarter, year, data } = req.body;
  const report = db.createReport({
    project_code: user.project_code,
    created_by_id: user.id,
    created_by_email: user.email,
    status: 'draft',
    period_from: period_from || '',
    period_to: period_to || '',
    report_number: report_number || '',
    quarter: quarter || null,
    year: year || null,
    data: data || {}
  });
  res.status(201).json({ report });
});

// PATCH /api/reports/:id — update draft
router.patch('/:id', verifyToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.findUserById(req.user.id);
  const report = db.getReportById(id);
  if (!report) return res.status(404).json({ error: 'Rapport introuvable.' });
  if (report.project_code !== user.project_code) return res.status(403).json({ error: 'Accès refusé.' });
  if (report.status === 'submitted') return res.status(400).json({ error: 'Un rapport soumis ne peut pas être modifié.' });

  const { period_from, period_to, report_number, quarter, year, data } = req.body;
  const updated = db.updateReport(id, { period_from, period_to, report_number, quarter, year, data });
  res.json({ report: updated });
});

// POST /api/reports/:id/submit — coordinateur only → generate Word + send email
router.post('/:id/submit', verifyToken, requireRole('coordinateur'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.findUserById(req.user.id);
  const report = db.getReportById(id);
  if (!report) return res.status(404).json({ error: 'Rapport introuvable.' });
  if (report.project_code !== user.project_code) return res.status(403).json({ error: 'Accès refusé.' });
  if (report.status === 'submitted') return res.status(400).json({ error: 'Rapport déjà soumis.' });

  const submitted = db.submitReport(id);
  const sapProject = sapFull[report.project_code] || null;

  let wordResult = null;
  let emailResult = null;

  try {
    const wordBuffer = await generateReport(submitted, sapProject);
    wordResult = { generated: true };

    emailResult = await sendSubmissionEmail({ report: submitted, sapProject, wordBuffer });
  } catch (err) {
    console.error('[submit] Erreur génération/email:', err.message);
    wordResult = { generated: false, error: err.message };
    emailResult = { sent: false, error: err.message };
  }

  res.json({ report: submitted, word: wordResult, email: emailResult });
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
    quarter: null,
    year: source.year || null,
    data: JSON.parse(JSON.stringify(source.data))
  });
  res.status(201).json({ report: copy });
});

// GET /api/reports/:id/download — download Word for submitted report
router.get('/:id/download', verifyToken, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.findUserById(req.user.id);
  const report = db.getReportById(id);
  if (!report) return res.status(404).json({ error: 'Rapport introuvable.' });
  if (report.project_code !== user.project_code) return res.status(403).json({ error: 'Accès refusé.' });

  const sapProject = sapFull[report.project_code] || null;
  try {
    const wordBuffer = await generateReport(report, sapProject);
    const qLabel = report.quarter ? `${report.quarter}_${report.year}` : (report.period_from || 'rapport');
    const filename = `QPR_${report.project_code}_${qLabel}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(wordBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Erreur génération Word: ' + err.message });
  }
});

// DELETE /api/reports/:id — coordinateur only, drafts only
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
