const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType
} = require('docx');

// Human-readable labels for known form fields
const FIELD_LABELS = {
  'f-rptno': 'Numéro du rapport',
  'f-period-from': 'Période du',
  'f-period-to': 'Période au',
  'f-exagency': 'Agence d\'exécution',
  'f-iagency': 'Agence de mise en œuvre',
  'f-overall-rating': 'Note globale d\'avancement',
  'f-exec-summary': 'Résumé exécutif',
  'f-progress': 'Avancement global (%)',
  'f-pdo-achieved': 'ODP atteint (%)',
  'f-issues': 'Problèmes rencontrés',
  'f-risks': 'Risques identifiés',
  'f-next-steps': 'Prochaines étapes',
  'f-disbursed': 'Montant décaissé',
  'f-disbrate': 'Taux de décaissement (%)',
  'f-elapse': 'Temps écoulé (%)',
  'f-comments': 'Commentaires'
};

// Group field keys into sections by prefix
const SECTIONS = [
  { title: 'Informations Générales', keys: ['f-rptno','f-period-from','f-period-to','f-exagency','f-iagency'] },
  { title: 'Avancement et Performance', keys: ['f-overall-rating','f-progress','f-pdo-achieved','f-exec-summary'] },
  { title: 'Risques et Problèmes', keys: ['f-issues','f-risks'] },
  { title: 'Aspects Financiers', keys: ['f-disbursed','f-disbrate','f-elapse'] },
  { title: 'Prochaines Étapes et Commentaires', keys: ['f-next-steps','f-comments'] }
];

function quarterLabel(q, year) {
  if (!q) return '';
  return `${q} - ${year || ''}`;
}

function fieldLabel(key) {
  return FIELD_LABELS[key] || key.replace(/^f-/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function cell(text, options = {}) {
  return new TableCell({
    shading: options.header ? { type: ShadingType.SOLID, color: '0F6E56', fill: '0F6E56' } : undefined,
    children: [new Paragraph({
      children: [new TextRun({
        text: String(text || '—'),
        bold: options.bold || options.header,
        color: options.header ? 'FFFFFF' : '3D3D3A',
        size: options.header ? 20 : 18
      })]
    })]
  });
}

async function generateReport(report, sapProject) {
  const data = report.data || {};
  const qLabel = quarterLabel(report.quarter, report.year);
  const tm = sapProject ? sapProject.taskManager : null;

  const headerBg = '04342C';

  // Title section
  const titleParagraphs = [
    new Paragraph({
      children: [new TextRun({ text: 'RAPPORT D\'ÉTAT D\'EXÉCUTION', bold: true, size: 36, color: 'FFFFFF', font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.SOLID, color: headerBg, fill: headerBg },
      spacing: { before: 200, after: 200 }
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Quarterly Progress Report (QPR)', size: 24, color: 'DDDDDD', font: 'Calibri' })],
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.SOLID, color: headerBg, fill: headerBg },
      spacing: { before: 0, after: 200 }
    }),
    new Paragraph({ text: '' })
  ];

  // Project info table
  const projectRows = [
    new TableRow({ children: [cell('Projet', { header: true }), cell((sapProject && sapProject.title) || report.project_code)] }),
    new TableRow({ children: [cell('Code Projet', { header: true }), cell(report.project_code)] }),
    new TableRow({ children: [cell('Pays', { header: true }), cell(sapProject ? sapProject.country : '—')] }),
    new TableRow({ children: [cell('Secteur', { header: true }), cell(sapProject ? sapProject.sector : '—')] }),
    ...(qLabel ? [new TableRow({ children: [cell('Période de rapport', { header: true }), cell(qLabel)] })] : []),
    new TableRow({ children: [cell('Période Du / Au', { header: true }), cell((report.period_from || '—') + ' → ' + (report.period_to || '—'))] }),
    new TableRow({ children: [cell('Créé par', { header: true }), cell(report.created_by_email)] }),
    ...(tm ? [new TableRow({ children: [cell('Chargé(e) de projet', { header: true }), cell(`${tm.name} (${tm.division})`)] })] : [])
  ];

  const projectTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: projectRows
  });

  // Content sections
  const contentParagraphs = [];
  const usedKeys = new Set();

  SECTIONS.forEach(section => {
    const relevant = section.keys.filter(k => data[k] !== undefined && data[k] !== '');
    if (!relevant.length) return;

    contentParagraphs.push(
      new Paragraph({ text: '' }),
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: section.title, bold: true, size: 24, color: '0F6E56' })]
      })
    );

    relevant.forEach(k => {
      usedKeys.add(k);
      contentParagraphs.push(
        new Paragraph({ children: [new TextRun({ text: fieldLabel(k), bold: true, size: 20, color: '3D3D3A' })] }),
        new Paragraph({ children: [new TextRun({ text: String(data[k] || '—'), size: 20 })], spacing: { after: 100 } })
      );
    });
  });

  // Remaining fields not in SECTIONS
  const remaining = Object.entries(data).filter(([k]) => !usedKeys.has(k) && data[k] !== '' && data[k] !== undefined);
  if (remaining.length) {
    contentParagraphs.push(
      new Paragraph({ text: '' }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Autres Informations', bold: true, size: 24, color: '0F6E56' })] })
    );
    remaining.forEach(([k, v]) => {
      contentParagraphs.push(
        new Paragraph({ children: [new TextRun({ text: fieldLabel(k), bold: true, size: 20 })] }),
        new Paragraph({ children: [new TextRun({ text: String(v), size: 20 })], spacing: { after: 100 } })
      );
    });
  }

  // Footer paragraph
  const footer = new Paragraph({
    children: [new TextRun({ text: `QPR Platform · RASME / AFDB · Généré le ${new Date().toLocaleDateString('fr-FR')}`, size: 16, color: '999999' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 }
  });

  const doc = new Document({
    sections: [{
      children: [
        ...titleParagraphs,
        projectTable,
        ...contentParagraphs,
        footer
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}

module.exports = { generateReport };
