const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'qpr_users.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: [], nextId: 1, reports: [], reportNextId: 1 };
  }
}

function write(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── USERS ─────────────────────────────────────────────────

function findUserByEmail(email) {
  return read().users.find(u => u.email === email) || null;
}

function findUserById(id) {
  return read().users.find(u => u.id === id) || null;
}

function createUser(email, passwordHash, role, project_code) {
  const data = read();
  const user = {
    id: data.nextId,
    email,
    password: passwordHash,
    role,
    project_code: project_code || null,
    created_at: new Date().toISOString()
  };
  data.users.push(user);
  data.nextId++;
  write(data);
  return user;
}

function updateUserRole(id, role) {
  const data = read();
  const user = data.users.find(u => u.id === id);
  if (!user) return false;
  user.role = role;
  write(data);
  return true;
}

function getUsersByProject(project_code) {
  return read().users
    .filter(u => u.project_code === project_code)
    .map(u => ({ id: u.id, email: u.email, role: u.role, project_code: u.project_code, created_at: u.created_at }));
}

function getAllUsers() {
  return read().users.map(u => ({
    id: u.id, email: u.email, role: u.role, project_code: u.project_code, created_at: u.created_at
  }));
}

function hasCoordinateurForProject(project_code) {
  return read().users.some(u => u.project_code === project_code && u.role === 'coordinateur');
}

// ── REPORTS ───────────────────────────────────────────────

function getReportsByProject(project_code) {
  const data = read();
  return (data.reports || [])
    .filter(r => r.project_code === project_code)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getReportById(id) {
  return (read().reports || []).find(r => r.id === id) || null;
}

function createReport({ project_code, created_by_id, created_by_email, status, period_from, period_to, report_number, data }) {
  const db = read();
  if (!db.reports) db.reports = [];
  if (!db.reportNextId) db.reportNextId = 1;
  const report = {
    id: db.reportNextId,
    project_code,
    created_by_id,
    created_by_email,
    status,
    period_from,
    period_to,
    report_number,
    data: data || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  db.reports.push(report);
  db.reportNextId++;
  write(db);
  return report;
}

function updateReport(id, { period_from, period_to, report_number, data }) {
  const db = read();
  const report = (db.reports || []).find(r => r.id === id);
  if (!report) return null;
  if (period_from !== undefined) report.period_from = period_from;
  if (period_to !== undefined) report.period_to = period_to;
  if (report_number !== undefined) report.report_number = report_number;
  if (data !== undefined) report.data = data;
  report.updated_at = new Date().toISOString();
  write(db);
  return report;
}

function submitReport(id) {
  const db = read();
  const report = (db.reports || []).find(r => r.id === id);
  if (!report) return null;
  report.status = 'submitted';
  report.submitted_at = new Date().toISOString();
  report.updated_at = new Date().toISOString();
  write(db);
  return report;
}

function deleteReport(id) {
  const db = read();
  db.reports = (db.reports || []).filter(r => r.id !== id);
  write(db);
}

module.exports = {
  findUserByEmail, findUserById, createUser, updateUserRole,
  getUsersByProject, getAllUsers, hasCoordinateurForProject,
  getReportsByProject, getReportById, createReport, updateReport, submitReport, deleteReport
};
