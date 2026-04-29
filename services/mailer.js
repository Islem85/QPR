const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendSubmissionEmail({ report, sapProject, wordBuffer }) {
  if (!isConfigured()) {
    console.log('[mailer] SMTP non configuré — email non envoyé. Configurer SMTP_HOST/USER/PASS dans .env');
    return { skipped: true, reason: 'SMTP_NOT_CONFIGURED' };
  }

  const tm = sapProject && sapProject.taskManager;
  const toEmail = tm ? tm.email : process.env.SMTP_USER;
  const toName = tm ? tm.name : 'Chargé(e) de Projet';
  const projTitle = (sapProject && sapProject.title) || report.project_code;
  const qLabel = report.quarter ? `${report.quarter} - ${report.year}` : '';
  const period = [report.period_from, report.period_to].filter(Boolean).join(' au ');

  const subject = `QPR ${qLabel || period} – ${projTitle} (${report.project_code})`;

  const body = [
    `Bonjour ${toName},`,
    '',
    `Veuillez trouver en pièce jointe le Rapport d'État d'Exécution (QPR) ${qLabel || ''} `,
    `du projet ${projTitle} (${report.project_code})${period ? ` pour la période du ${period}` : ''}.`,
    '',
    'Ce rapport a été préparé et soumis via la plateforme QPR RASME.',
    'Veuillez accuser réception et communiquer vos observations.',
    '',
    'Cordialement,',
    `${report.created_by_email}`,
    '',
    '---',
    'QPR Platform · RASME / AFDB'
  ].join('\n');

  const filename = `QPR_${report.project_code}_${(qLabel || period).replace(/[^A-Za-z0-9-]/g, '_')}.docx`;

  const transporter = createTransport();
  const result = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: `"${toName}" <${toEmail}>`,
    cc: report.created_by_email,
    subject,
    text: body,
    attachments: [{ filename, content: wordBuffer, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]
  });

  console.log(`[mailer] Email envoyé à ${toEmail} — messageId: ${result.messageId}`);
  return { sent: true, to: toEmail, messageId: result.messageId };
}

module.exports = { sendSubmissionEmail, isConfigured };
