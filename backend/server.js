const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

// Database
const DB_PATH = path.join(__dirname, '..', 'data', 'class_assignment.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== Excel 美化工具函数 =====
function beautifySheet(ws, headers) {
  if (!ws || !headers || headers.length === 0) return ws;

  // 获取数据范围
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const rowCount = range.e.r; // 数据行数（含表头）
  if (rowCount < 0) return ws;

  // 1. 自动列宽
  const colWidths = [];
  for (let c = 0; c <= range.e.c; c++) {
    let maxLen = headers[c] ? headers[c].length * 2.5 : 10;
    for (let r = 1; r <= rowCount; r++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (cell && cell.v !== undefined && cell.v !== null) {
        const len = String(cell.v).length;
        // 中文字符宽度约2倍
        const cjkCount = (String(cell.v).match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
        const adjustedLen = len + cjkCount;
        maxLen = Math.max(maxLen, adjustedLen);
      }
    }
    colWidths.push({ wch: Math.min(Math.max(maxLen + 2, 8), 60) });
  }
  ws['!cols'] = colWidths;

  // 2. 自动筛选
  const lastCol = XLSX.utils.encode_col(range.e.c);
  ws['!autofilter'] = { ref: `A1:${lastCol}${rowCount + 1}` };

  // 3. 冻结首行（通过sheet views）
  if (!ws['!freeze']) {
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  }

  // 4. 日期列格式化（查找"填报时间""时间"相关列）
  headers.forEach((h, i) => {
    if (h && (h.includes('时间') || h.includes('日期'))) {
      const colLetter = XLSX.utils.encode_col(i);
      for (let r = 1; r <= rowCount; r++) {
        const cellRef = `${colLetter}${r + 1}`;
        const cell = ws[cellRef];
        if (cell && cell.v) {
          cell.z = 'yyyy-mm-dd hh:mm:ss';
        }
      }
    }
  });

  // 5. 学号列设为文本格式（避免科学计数法）
  headers.forEach((h, i) => {
    if (h === '学号') {
      const colLetter = XLSX.utils.encode_col(i);
      for (let r = 1; r <= rowCount; r++) {
        const cellRef = `${colLetter}${r + 1}`;
        const cell = ws[cellRef];
        if (cell && cell.v) {
          cell.z = '@'; // 文本格式
          cell.t = 's';
        }
      }
    }
  });

  return ws;
}

// Create sessions table if not exists
db.exec(`CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  expires_at TEXT
)`);

// Middleware
app.use(cors());
app.use(express.json());
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Default route -> login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

// ============== TOKEN HELPERS ==============
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(userId, role, hoursValid = 24) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + hoursValid * 3600000).toISOString();
  // Remove old sessions for this user
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, role, expiresAt);
  return token;
}

function validateSession(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return session;
}

function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ============== AUTH MIDDLEWARE ==============
function authMiddleware(requiredRole) {
  return (req, res, next) => {
    let token = null;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      token = auth.slice(7);
    } else if (req.query.token) {
      token = req.query.token;
    }
    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }
    const session = validateSession(token);
    if (!session) {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    if (requiredRole && session.role !== requiredRole) {
      return res.status(403).json({ error: '权限不足' });
    }
    req.session = session;
    next();
  };
}

// Super admin middleware: requires admin role + 'super' in admins table
function requireSuper(req, res, next) {
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.session.user_id);
  if (!admin || admin.role !== 'super') {
    return res.status(403).json({ error: '权限不足，仅超级管理员可操作' });
  }
  next();
}

const requireStudent = authMiddleware('student');
const requireAdmin = authMiddleware('admin');
const requireAuth = authMiddleware();

// ============== AUTH API ==============

// Verify token and return role + redirect
app.get('/api/auth/verify', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  const token = auth.slice(7);
  const session = validateSession(token);
  if (!session) {
    return res.status(401).json({ error: '登录已过期' });
  }

  let userInfo = null;
  if (session.role === 'student') {
    const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(session.user_id);
    if (student) {
      userInfo = {
        studentId: student.student_id,
        name: student.name,
        major: student.major,
        class_name: student.class_name,
        firstLogin: student.first_login === 1
      };
    }
  } else if (session.role === 'admin') {
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(session.user_id);
    if (admin) {
      userInfo = {
        username: admin.username,
        displayName: admin.display_name
      };
    }
  }

  res.json({
    success: true,
    role: session.role,
    redirect: session.role === 'student' ? 'student.html' : 'admin.html',
    user: userInfo
  });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    destroySession(auth.slice(7));
  }
  res.json({ success: true, message: '已退出登录' });
});

// ============== STUDENT API ==============

// Student login
app.post('/api/student/login', (req, res) => {
  const { studentId, password } = req.body;
  if (!studentId || !password) return res.status(400).json({ error: '请输入学号和密码' });

  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) return res.status(401).json({ error: '学号不存在，请检查后重试' });

  // Check if locked
  if (student.locked === 1) {
    return res.status(423).json({ error: '账户已被锁定，请联系管理员重置密码', locked: true });
  }
  if (student.status === 'disabled') {
    return res.status(403).json({ error: '该账号已被注销，无法登录' });
  }

  if (student.password !== password) {
    const attempts = (student.failed_attempts || 0) + 1;
    if (attempts >= 5) {
      db.prepare('UPDATE students SET failed_attempts = ?, locked = 1 WHERE student_id = ?').run(attempts, studentId);
      return res.status(423).json({ error: '密码连续错误5次，账户已被锁定。请联系管理员重置密码', locked: true });
    }
    db.prepare('UPDATE students SET failed_attempts = ? WHERE student_id = ?').run(attempts, studentId);
    return res.status(401).json({ error: `密码错误，还剩${5 - attempts}次尝试机会`, failedAttempts: attempts });
  }

  // Success - reset failed attempts
  db.prepare('UPDATE students SET failed_attempts = 0, locked = 0 WHERE student_id = ?').run(studentId);

  const token = createSession(student.student_id, 'student');

  res.json({
    success: true,
    token,
    role: 'student',
    redirect: 'student.html',
    firstLogin: student.first_login === 1,
    student: {
      studentId: student.student_id,
      name: student.name,
      major: student.major,
      class_name: student.class_name,
      original_class: student.original_class || student.class_name,
      gender: student.gender || ''
    }
  });
});

// Change password
app.post('/api/student/change-password', requireStudent, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: '密码至少6位' });

  db.prepare('UPDATE students SET password = ?, first_login = 0 WHERE student_id = ?')
    .run(newPassword, req.session.user_id);
  res.json({ success: true, message: '密码修改成功' });
});

// Get student info with preferences
app.get('/api/student/info', requireStudent, (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.session.user_id);
  const prefs = db.prepare('SELECT * FROM preferences WHERE student_id = ?').get(req.session.user_id);
  const settings = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(s => { settings[s.key] = s.value; });

  res.json({
    student: {
      studentId: student.student_id,
      name: student.name,
      major: student.major,
      class_name: student.class_name,
      original_class: student.original_class || student.class_name,
      gender: student.gender || '',
      firstLogin: student.first_login === 1
    },
    preferences: prefs || null,
    settings
  });
});

// Submit preferences
app.post('/api/student/submit', requireStudent, (req, res) => {
  const { choices } = req.body;
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(req.session.user_id);
  const major = student.major;

  // Check time settings
  const settings = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(s => { settings[s.key] = s.value; });
  const now = new Date();
  if (settings.registration_open !== '1') return res.status(403).json({ error: '志愿填报尚未开放' });
  if (settings.start_time && new Date(settings.start_time) > now) return res.status(403).json({ error: '志愿填报尚未开始' });
  if (settings.end_time && new Date(settings.end_time) < now) return res.status(403).json({ error: '志愿填报已截止' });

  if (!choices || !Array.isArray(choices)) return res.status(400).json({ error: '请提交志愿数据' });

  const bigDataOptions = ['大数据VR方向', '大数据分析运维', '大数据应用开发'];
  const cloudOptions = ['云计算运维与安全', '新媒体技术方向'];

  if (major === '大数据') {
    if (choices.length !== 3) return res.status(400).json({ error: '大数据专业需要填报3个志愿' });
    for (const c of choices) {
      if (!bigDataOptions.includes(c)) return res.status(400).json({ error: `无效的方向: ${c}` });
    }
  } else if (major === '云计算') {
    if (choices.length !== 2) return res.status(400).json({ error: '云计算专业需要填报2个志愿' });
    for (const c of choices) {
      if (!cloudOptions.includes(c)) return res.status(400).json({ error: `无效的方向: ${c}` });
    }
  }

  if (new Set(choices).size !== choices.length) return res.status(400).json({ error: '志愿方向不能重复' });

  if (major === '大数据' && choices.some(c => cloudOptions.includes(c) && !bigDataOptions.includes(c))) {
    return res.status(400).json({ error: '大数据专业不能填报云计算相关方向' });
  }
  if (major === '云计算' && choices.some(c => bigDataOptions.includes(c) && !cloudOptions.includes(c))) {
    return res.status(400).json({ error: '云计算专业不能填报大数据相关方向' });
  }

  const choice1 = choices[0] || null;
  const choice2 = choices[1] || null;
  const choice3 = choices[2] || null;
  const choice4 = choices[3] || null;

  const existing = db.prepare('SELECT * FROM preferences WHERE student_id = ?').get(req.session.user_id);
  if (existing) {
    db.prepare('UPDATE preferences SET choice1=?, choice2=?, choice3=?, choice4=?, updated_at=datetime(\'now\',\'localtime\') WHERE student_id=?')
      .run(choice1, choice2, choice3, choice4, req.session.user_id);
  } else {
    db.prepare('INSERT INTO preferences (student_id, choice1, choice2, choice3, choice4) VALUES (?, ?, ?, ?, ?)')
      .run(req.session.user_id, choice1, choice2, choice3, choice4);
  }

  res.json({ success: true, message: '志愿提交成功' });
});

// Student stats (same data as admin stats but accessible to students)
app.get('/api/stats', requireAuth, (req, res) => {
  // Get student's major
  const student = db.prepare('SELECT major, student_id FROM students WHERE student_id = ?').get(req.session.user_id);
  if (!student) return res.status(404).json({ error: '学生不存在' });
  const myMajor = student.major;

  let submitted, unfilled, dirs, directionStats, majorTotal;
  if (myMajor === '大数据') {
    majorTotal = db.prepare("SELECT COUNT(*) as count FROM students WHERE major='大数据'").get().count;
    submitted = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id=s.student_id WHERE s.major='大数据' AND p.choice1 IS NOT NULL").get().c;
    unfilled = majorTotal - submitted;
    dirs = ['大数据分析运维','大数据应用开发','大数据VR方向'];
  } else {
    majorTotal = db.prepare("SELECT COUNT(*) as count FROM students WHERE major='云计算'").get().count;
    submitted = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id=s.student_id WHERE s.major='云计算' AND p.choice1 IS NOT NULL").get().c;
    unfilled = majorTotal - submitted;
    dirs = ['云计算运维与安全','新媒体技术方向'];
  }

  directionStats = dirs.map(d => {
    let c;
    if (d === '新媒体技术方向') {
      c = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id = s.student_id WHERE p.choice1='新媒体技术方向'").get().c;
    } else {
      c = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice1=?').get(d).c;
    }
    return { name: d, count: c };
  });

  res.json({
    my_major: myMajor,
    total_submitted: submitted,
    total_unfilled: unfilled,
    direction_stats: directionStats
  });
});

// ============== ADMIN API ==============

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin) return res.status(401).json({ error: '账号不存在，请检查后重试' });
  if (admin.password !== password) return res.status(401).json({ error: '密码错误，请检查后重试' });
  if (admin.status === 'disabled') return res.status(403).json({ error: '该账号已被注销，无法登录' });

  const token = createSession(admin.username, 'admin');

  res.json({
    success: true,
    token,
    role: 'admin',
    adminRole: admin.role || 'super',
    redirect: 'admin.html',
    admin: {
      username: admin.username,
      displayName: admin.display_name
    }
  });
});

// Update admin display name
app.put('/api/admin/name', requireAdmin, (req, res) => {
  const { displayName } = req.body;
  if (!displayName || !displayName.trim()) return res.status(400).json({ error: '姓名不能为空' });
  if (displayName.length > 20) return res.status(400).json({ error: '姓名不能超过20个字符' });
  db.prepare('UPDATE admins SET display_name = ? WHERE username = ?').run(displayName.trim(), req.session.user_id);
  res.json({ success: true, message: '姓名修改成功', displayName: displayName.trim() });
});

// Change admin own password
app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写旧密码和新密码' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6位' });
  
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(req.session.user_id);
  if (!admin || admin.password !== oldPassword) return res.status(400).json({ error: '旧密码错误' });
  
  db.prepare('UPDATE admins SET password = ? WHERE username = ?').run(newPassword, req.session.user_id);
  res.json({ success: true, message: '密码修改成功' });
});

// Get settings
app.get('/api/admin/settings', requireAdmin, requireSuper, (req, res) => {
  const settings = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(s => { settings[s.key] = s.value; });
  res.json(settings);
});

// Update settings
app.post('/api/admin/settings', requireAdmin, requireSuper, (req, res) => {
  const startTime = req.body.start_time;
  const endTime = req.body.end_time;
  const registrationOpen = req.body.registration_open;
  if (startTime !== undefined) db.prepare('UPDATE settings SET value=? WHERE key=?').run(startTime, 'start_time');
  if (endTime !== undefined) db.prepare('UPDATE settings SET value=? WHERE key=?').run(endTime, 'end_time');
  // Auto-enable registration when time is set
  if (startTime || endTime) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('registration_open', '1')").run();
  if (registrationOpen !== undefined) db.prepare('UPDATE settings SET value=? WHERE key=?').run(registrationOpen ? '1' : '0', 'registration_open');
  res.json({ success: true, message: '设置已更新' });
});

// Get all students with lock status
app.get('/api/admin/students', requireAdmin, (req, res) => {
  const students = db.prepare(`
    SELECT student_id, name, major, class_name, gender, original_class,
           locked, failed_attempts, first_login
    FROM students ORDER BY student_id
  `).all();
  res.json(students);
});

// Unlock and reset password for a student
app.post('/api/admin/unlock', requireAdmin, requireSuper, (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ error: '请输入学号' });
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: '学号不存在' });
  // Reset: unlock, clear attempts, reset password to student ID
  db.prepare('UPDATE students SET locked = 0, failed_attempts = 0, password = ?, first_login = 1 WHERE student_id = ?')
    .run(studentId, studentId);
  res.json({ success: true, message: `学号 ${studentId} 已解锁，密码已重置为学号` });
});

// Public stats (no auth required for login page display)
app.get('/api/public/stats', (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  const totalSubmitted = db.prepare('SELECT COUNT(*) as count FROM preferences WHERE choice1 IS NOT NULL').get().count;
  const totalUnfilled = totalStudents - totalSubmitted;

  // Big data students
  const bigdataTotal = db.prepare("SELECT COUNT(*) as count FROM students WHERE major='大数据'").get().count;
  const bigdataSubmitted = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id=s.student_id WHERE s.major='大数据' AND p.choice1 IS NOT NULL").get().c;
  const bigdataUnfilled = bigdataTotal - bigdataSubmitted;

  // Cloud students
  const cloudTotal = db.prepare("SELECT COUNT(*) as count FROM students WHERE major='云计算'").get().count;
  const cloudSubmitted = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id=s.student_id WHERE s.major='云计算' AND p.choice1 IS NOT NULL").get().c;
  const cloudUnfilled = cloudTotal - cloudSubmitted;

  // Big data direction first-choice stats (ordered: 大数据分析运维, 大数据应用开发, 大数据VR方向)
  const bigdataDirs = ['大数据分析运维','大数据应用开发','大数据VR方向'];
  const bigdataDirectionStats = bigdataDirs.map(d => ({
    name: d,
    count: db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice1=?').get(d).c
  }));

  // Cloud direction first-choice stats (ordered: 云计算运维与安全, 新媒体技术方向)
  const cloudDirs = ['云计算运维与安全','新媒体技术方向'];
  const cloudDirectionStats = cloudDirs.map(d => {
    let c;
    if (d === '新媒体技术方向') {
      c = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id = s.student_id WHERE p.choice1='新媒体技术方向'").get().c;
    } else {
      c = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice1=?').get(d).c;
    }
    return { name: d, count: c };
  });

  res.json({
    total_students: totalStudents, total_submitted: totalSubmitted, total_unfilled: totalUnfilled,
    bigdata_total: bigdataTotal, bigdata_submitted: bigdataSubmitted, bigdata_unfilled: bigdataUnfilled,
    bigdata_direction_stats: bigdataDirectionStats,
    cloud_total: cloudTotal, cloud_submitted: cloudSubmitted, cloud_unfilled: cloudUnfilled,
    cloud_direction_stats: cloudDirectionStats
  });
});

// Get dashboard stats
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  const totalSubmitted = db.prepare('SELECT COUNT(*) as count FROM preferences WHERE choice1 IS NOT NULL').get().count;
  const totalUnfilled = totalStudents - totalSubmitted;
  const bigdataCount = db.prepare("SELECT COUNT(*) as count FROM students WHERE major='大数据'").get().count;
  const cloudCount = db.prepare("SELECT COUNT(*) as count FROM students WHERE major='云计算'").get().count;

  // Direction first-choice stats
  const dirs = ['大数据VR方向','大数据分析运维','大数据应用开发','新媒体技术方向','云计算运维与安全'];
  const directionStats = dirs.map(d => {
    let c;
    if (d === '新媒体技术方向') {
      c = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id = s.student_id WHERE p.choice1='新媒体技术方向'").get().c;
    } else {
      c = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice1=?').get(d).c;
    }
    return { name: d, count: c };
  });

  // Detail stats per direction
  const detailStats = dirs.map(d => {
    let total, r1, r2, r3, r4;
    if (d === '新媒体技术方向') {
      const q = "SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id = s.student_id WHERE (p.choice1='新媒体技术方向' OR p.choice2='新媒体技术方向' OR p.choice3='新媒体技术方向' OR p.choice4='新媒体技术方向') ";
      total = db.prepare(q).get().c;
      r1 = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id = s.student_id WHERE p.choice1='新媒体技术方向' ").get().c;
      r2 = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id = s.student_id WHERE p.choice2='新媒体技术方向' ").get().c;
      r3 = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id = s.student_id WHERE p.choice3='新媒体技术方向' ").get().c;
      r4 = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id = s.student_id WHERE p.choice4='新媒体技术方向' ").get().c;
    } else {
      total = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice1=? OR choice2=? OR choice3=? OR choice4=?').get(d,d,d,d).c;
      r1 = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice1=?').get(d).c;
      r2 = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice2=?').get(d).c;
      r3 = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice3=?').get(d).c;
      r4 = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice4=?').get(d).c;
    }
    return { name: d, total, rank1: r1, rank2: r2, rank3: r3, rank4: r4, fill_rate: totalSubmitted > 0 ? ((total/totalSubmitted)*100).toFixed(1) : '0.0' };
  });

  // Grouped data for charts
  const bigdataSubmitted = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id=s.student_id WHERE s.major='大数据' AND p.choice1 IS NOT NULL").get().c;
  const bigdataUnfilled = bigdataCount - bigdataSubmitted;
  const bigdataDirs = ['大数据分析运维','大数据应用开发','大数据VR方向'];
  const bigdataDirectionStats = bigdataDirs.map(d => ({ name: d, count: db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice1=?').get(d).c }));

  const cloudSubmitted = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id=s.student_id WHERE s.major='云计算' AND p.choice1 IS NOT NULL").get().c;
  const cloudUnfilled = cloudCount - cloudSubmitted;
  const cloudDirs = ['云计算运维与安全','新媒体技术方向'];
  const cloudDirectionStats = cloudDirs.map(d => {
    let c;
    if (d === '新媒体技术方向') c = db.prepare("SELECT COUNT(*) as c FROM preferences p JOIN students s ON p.student_id=s.student_id WHERE p.choice1='新媒体技术方向'").get().c;
    else c = db.prepare('SELECT COUNT(*) as c FROM preferences WHERE choice1=?').get(d).c;
    return { name: d, count: c };
  });

  res.json({
    total_students: totalStudents, total_submitted: totalSubmitted, total_unfilled: totalUnfilled,
    bigdata_count: bigdataCount, cloud_count: cloudCount, direction_stats: directionStats, detail_stats: detailStats,
    bigdata_submitted: bigdataSubmitted, bigdata_unfilled: bigdataUnfilled, bigdata_direction_stats: bigdataDirectionStats,
    cloud_submitted: cloudSubmitted, cloud_unfilled: cloudUnfilled, cloud_direction_stats: cloudDirectionStats
  });
});

// Search student
app.post('/api/admin/search-student', requireAdmin, (req, res) => {
  const { keyword } = req.body;
  if (!keyword) return res.json({ students: [] });
  const students = db.prepare(`
    SELECT s.student_id, s.name, s.gender, s.major, s.class_name, s.password, s.locked,
           p.choice1 as rank1, p.choice2 as rank2, p.choice3 as rank3, p.choice4 as rank4, p.updated_at
    FROM students s LEFT JOIN preferences p ON s.student_id = p.student_id
    WHERE s.student_id LIKE ? OR s.name LIKE ?
    ORDER BY s.student_id LIMIT 100
  `).all('%'+keyword+'%', '%'+keyword+'%');
  students.forEach(s => {
    s.is_default = s.password === s.student_id;
    s.rank1 = s.rank1 || '';
    s.rank2 = s.rank2 || '';
    s.rank3 = s.rank3 || '';
    s.rank4 = s.rank4 || '';
  });
  res.json({ students });
});

// Reset individual student password
app.post('/api/admin/reset-password', requireAdmin, requireSuper, (req, res) => {
  const { studentId } = req.body;
  if (!studentId) return res.status(400).json({ error: '请输入学号' });
  const s = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!s) return res.status(404).json({ error: '学号不存在' });
  db.prepare('UPDATE students SET password = ?, first_login = 1, locked = 0, failed_attempts = 0 WHERE student_id = ?').run(studentId, studentId);
  res.json({ success: true, message: `学号 ${studentId} 密码已重置为学号`, newPassword: studentId });
});

// 手动导入
app.post('/api/admin/manual-import', requireAdmin, requireSuper, (req, res) => {
  const { records } = req.body;
  if (!records || !Array.isArray(records)) return res.status(400).json({ error: '无数据' });
  if (records.length === 0) return res.status(400).json({ error: '无记录' });
  if (records.length > 200) return res.status(400).json({ error: '单次最多导入200条' });

  const superAdmins = new Set(db.prepare("SELECT username FROM admins WHERE role='super'").all().map(r => r.username));
  let imported = 0;
  const errors = [];

  const transaction = db.transaction(() => {
    for (const r of records) {
      if (r.type === 'student') {
        if (!r.name || !r.student_id || !r.original_class || !r.major) {
          errors.push((r.name || r.student_id || '未知') + ': 必填字段缺失'); continue;
        }
        if (!/^\d{10}$/.test(r.student_id)) {
          errors.push(r.student_id + ': 学号需为10位数字'); continue;
        }
        const exists = db.prepare('SELECT student_id FROM students WHERE student_id=?').get(r.student_id);
        if (exists) {
          db.prepare('UPDATE students SET name=?, gender=?, major=?, class_name=?, original_class=? WHERE student_id=?')
            .run(r.name, r.gender||'', r.major, r.class_name, r.original_class, r.student_id);
        } else {
          db.prepare('INSERT INTO students (student_id, name, password, gender, major, class_name, original_class) VALUES (?,?,?,?,?,?,?)')
            .run(r.student_id, r.name, r.student_id, r.gender||'', r.major, r.class_name, r.original_class);
        }
        imported++;
      } else if (r.type === 'admin') {
        if (!r.display_name || !r.username || !r.password) {
          errors.push((r.username || '未知') + ': 必填字段缺失'); continue;
        }
        if (r.password.length < 6) {
          errors.push(r.username + ': 密码至少6位'); continue;
        }
        if (superAdmins.has(r.username)) {
          errors.push(r.username + ': 不能覆盖超级管理员账号'); continue;
        }
        const exists = db.prepare('SELECT username FROM admins WHERE username=?').get(r.username);
        if (exists) {
          db.prepare('UPDATE admins SET password=?, display_name=?, role="normal" WHERE username=?')
            .run(r.password, r.display_name, r.username);
        } else {
          db.prepare('INSERT INTO admins (username, password, display_name, role) VALUES (?,?,?,?)')
            .run(r.username, r.password, r.display_name, 'normal');
        }
        imported++;
      }
    }
  });
  transaction();

  db.prepare("INSERT INTO operation_logs (admin_id, action, detail, created_at) VALUES (?,?,?,datetime('now','localtime'))")
    .run(req.session.user_id, 'manual_import', '手动导入: ' + imported + '条');

  res.json({ imported, errors: errors.slice(0, 20) });
});

// Export data
app.get('/api/admin/export', requireAdmin, (req, res) => {
  const type = req.query.type || 'direction';
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();

  const dirHeaders = ['学号','姓名','性别','专业','班级','第一志愿','第二志愿','第三志愿','第四志愿','填报时间'];
  const majorHeadersBigData = ['学号','姓名','性别','班级','第一志愿','第二志愿','第三志愿','第四志愿','填报时间'];
  const majorHeadersCloud = ['学号','姓名','性别','班级','第一志愿','第二志愿','填报时间'];
  const unfilledHeaders = ['学号','姓名','性别','专业','班级','第一志愿','第二志愿','第三志愿','第四志愿','填报时间'];

  if (type === 'direction') {
    const regularDirs = ['大数据VR方向','大数据分析运维','大数据应用开发','云计算运维与安全'];
    regularDirs.forEach(dir => {
      const students = db.prepare(`
        SELECT s.student_id as 学号, s.name as 姓名, s.gender as 性别, s.major as 专业, s.class_name as 班级,
               p.choice1 as 第一志愿, p.choice2 as 第二志愿, p.choice3 as 第三志愿, p.choice4 as 第四志愿, p.updated_at as 填报时间
        FROM students s JOIN preferences p ON s.student_id = p.student_id
        WHERE p.choice1 = ? OR p.choice2 = ? OR p.choice3 = ? OR p.choice4 = ?
        ORDER BY s.student_id
      `).all(dir, dir, dir, dir);
      const ws = XLSX.utils.json_to_sheet(students);
      beautifySheet(ws, dirHeaders);
      XLSX.utils.book_append_sheet(wb, ws, dir);
    });
    // 新媒体技术方向
    const newmedia1 = db.prepare(`
      SELECT s.student_id as 学号, s.name as 姓名, s.gender as 性别, s.major as 专业, s.class_name as 班级,
             p.choice1 as 第一志愿, p.choice2 as 第二志愿, p.choice3 as 第三志愿, p.choice4 as 第四志愿, p.updated_at as 填报时间
      FROM students s JOIN preferences p ON s.student_id = p.student_id
      WHERE (p.choice1='新媒体技术方向' OR p.choice2='新媒体技术方向' OR p.choice3='新媒体技术方向' OR p.choice4='新媒体技术方向') 
      ORDER BY s.student_id
    `).all();
    const ws1 = XLSX.utils.json_to_sheet(newmedia1);
    beautifySheet(ws1, dirHeaders);
    XLSX.utils.book_append_sheet(wb, ws1, '新媒体技术方向');
    
    const newmedia2 = db.prepare(`
      SELECT s.student_id as 学号, s.name as 姓名, s.gender as 性别, s.major as 专业, s.class_name as 班级,
             p.choice1 as 第一志愿, p.choice2 as 第二志愿, p.choice3 as 第三志愿, p.choice4 as 第四志愿, p.updated_at as 填报时间
      FROM students s JOIN preferences p ON s.student_id = p.student_id
      WHERE (p.choice1='新媒体技术方向' OR p.choice2='新媒体技术方向' OR p.choice3='新媒体技术方向' OR p.choice4='新媒体技术方向') 
      ORDER BY s.student_id
    `).all();
    const ws2 = XLSX.utils.json_to_sheet(newmedia2);
    beautifySheet(ws2, dirHeaders);
    
    // 未填报
    const unfilled = db.prepare(`
      SELECT student_id as 学号, name as 姓名, gender as 性别, major as 专业, class_name as 班级,
             '' as 第一志愿, '' as 第二志愿, '' as 第三志愿, '' as 第四志愿, '' as 填报时间
      FROM students WHERE student_id NOT IN (SELECT student_id FROM preferences)
      ORDER BY student_id
    `).all();
    const wsU = XLSX.utils.json_to_sheet(unfilled);
    beautifySheet(wsU, unfilledHeaders);
    XLSX.utils.book_append_sheet(wb, wsU, '未填报');
  } else {
    ['大数据','云计算'].forEach(major => {
      const cols = major === '大数据'
        ? 'p.choice1 as 第一志愿, p.choice2 as 第二志愿, p.choice3 as 第三志愿, p.choice4 as 第四志愿'
        : 'p.choice1 as 第一志愿, p.choice2 as 第二志愿';
      const students = db.prepare(`
        SELECT s.student_id as 学号, s.name as 姓名, s.gender as 性别, s.class_name as 班级, ${cols}, p.updated_at as 填报时间
        FROM students s LEFT JOIN preferences p ON s.student_id = p.student_id
        WHERE s.major = ?
        ORDER BY s.student_id
      `).all(major);
      const ws = XLSX.utils.json_to_sheet(students);
      beautifySheet(ws, major === '大数据' ? majorHeadersBigData : majorHeadersCloud);
      XLSX.utils.book_append_sheet(wb, ws, major + '专业');
    });
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const fname = type === 'direction'
    ? encodeURIComponent(`分班志愿填报_按方向_${dateStr}.xlsx`)
    : encodeURIComponent(`分班志愿填报_按专业_${dateStr}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}`);
  res.send(buf);
});

// Export all student info
app.get('/api/admin/export/students', requireAdmin, (req, res) => {
  const XLSX = require('xlsx');
  const students = db.prepare(`
    SELECT s.student_id as 学号, s.name as 姓名, s.gender as 性别, s.major as 专业, s.class_name as 班级, s.original_class as 原班级,
           s.locked as 是否锁定, s.failed_attempts as 失败次数,
           p.choice1 as 第一志愿, p.choice2 as 第二志愿, p.choice3 as 第三志愿, p.choice4 as 第四志愿, p.updated_at as 填报时间
    FROM students s LEFT JOIN preferences p ON s.student_id = p.student_id
    ORDER BY s.student_id
  `).all();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(students);
  beautifySheet(ws, ['学号','姓名','性别','专业','班级','原班级','是否锁定','失败次数','第一志愿','第二志愿','第三志愿','第四志愿','填报时间']);
  XLSX.utils.book_append_sheet(wb, ws, '学生信息');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const filename2 = encodeURIComponent(`学生完整信息_${dateStr}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename2}`);
  res.send(buf);
});

// Reset all preferences and passwords
app.post('/api/admin/reset-all-preferences', requireAdmin, requireSuper, (req, res) => {
  const { password } = req.body;
  if (password !== 'admin123456') return res.status(403).json({ error: '重置密码错误' });
  // 清空所有志愿
  db.prepare('DELETE FROM preferences').run();
  // 重置所有学生密码为学号，设为首次登录，解锁所有账户
  db.prepare("UPDATE students SET password = student_id, first_login = 1, locked = 0, failed_attempts = 0").run();
  res.json({ success: true, message: '所有志愿数据已清空，密码已全部重置为学号，学生需重新登录修改密码' });
});

// Stat detail (for stats card click)
app.get('/api/admin/stat-detail', requireAdmin, (req, res) => {
  const type = req.query.type || 'total';
  let query;
  switch(type) {
    case 'submitted':
      query = `SELECT s.student_id, s.name, s.gender, s.major, s.class_name, p.choice1, p.choice2, p.choice3, p.choice4, p.updated_at
               FROM students s JOIN preferences p ON s.student_id = p.student_id ORDER BY s.student_id`;
      break;
    case 'unfilled':
      query = `SELECT student_id, name, gender, major, class_name FROM students
               WHERE student_id NOT IN (SELECT student_id FROM preferences) ORDER BY student_id`;
      break;
    case 'bigdata':
      query = `SELECT student_id, name, gender, major, class_name FROM students WHERE major='大数据' ORDER BY student_id`;
      break;
    case 'cloud':
      query = `SELECT student_id, name, gender, major, class_name FROM students WHERE major='云计算' ORDER BY student_id`;
      break;
    default:
      query = `SELECT student_id, name, gender, major, class_name FROM students ORDER BY student_id`;
  }
  const students = db.prepare(query).all();
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
  const count = type === 'total' ? totalStudents : students.length;
  res.json({ count, students });
});

// Export stat detail
app.get('/api/admin/export-stat-detail', requireAdmin, (req, res) => {
  const type = req.query.type || 'total';
  const nameMap = { total: '学生总数表', submitted: '已填报表', unfilled: '未填报表', bigdata: '大数据专业表', cloud: '云计算专业表' };
  const fetchfn = (t, cb) => {
    let q;
    switch(t) {
      case 'submitted': q = `SELECT s.student_id as 学号, s.name as 姓名, s.gender as 性别, s.major as 专业, s.class_name as 班级, p.choice1 as 第一志愿, p.choice2 as 第二志愿, p.choice3 as 第三志愿, p.choice4 as 第四志愿, p.updated_at as 填报时间 FROM students s JOIN preferences p ON s.student_id = p.student_id ORDER BY s.student_id`; break;
      case 'unfilled': q = `SELECT student_id as 学号, name as 姓名, gender as 性别, major as 专业, class_name as 班级, '' as 第一志愿, '' as 第二志愿, '' as 第三志愿, '' as 第四志愿, '' as 填报时间 FROM students WHERE student_id NOT IN (SELECT student_id FROM preferences) ORDER BY student_id`; break;
      case 'bigdata': q = `SELECT student_id as 学号, name as 姓名, gender as 性别, major as 专业, class_name as 班级 FROM students WHERE major='大数据' ORDER BY student_id`; break;
      case 'cloud': q = `SELECT student_id as 学号, name as 姓名, gender as 性别, major as 专业, class_name as 班级 FROM students WHERE major='云计算' ORDER BY student_id`; break;
      default: q = `SELECT student_id as 学号, name as 姓名, gender as 性别, major as 专业, class_name as 班级 FROM students ORDER BY student_id`;
    }
    cb(db.prepare(q).all());
  };
  fetchfn(type, (students) => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const sheetName = nameMap[type] || '学生';
    const headers = ['学号','姓名','性别','专业','班级','第一志愿','第二志愿','第三志愿','第四志愿','填报时间'];
    const ws = XLSX.utils.json_to_sheet(students);
    beautifySheet(ws, headers);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const fname2 = encodeURIComponent(`${sheetName}_${dateStr}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname2}`);
    res.send(buf);
  });
});

// ==================== 批量导入 ====================

// 模板下载 - 学生
app.get('/api/admin/template-students', requireAdmin, requireSuper, (req, res) => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const template = [
    { '学号(必填)': '', '姓名(必填)': '', '性别': '', '专业(大数据/云计算)': '', '班级(必填)': '', '原班级': '' }
  ];
  const ws = XLSX.utils.json_to_sheet(template);
  ws['!cols'] = [{wch:15},{wch:12},{wch:8},{wch:20},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws, '学生导入模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('学生导入模板.xlsx')}`);
  res.send(buf);
});

// 模板下载 - 管理员
app.get('/api/admin/template-admins', requireAdmin, requireSuper, (req, res) => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const template = [
    { '姓名(必填)': '', '账号(必填)': '', '初始密码(必填)': '', '部门': '', '备注': '' }
  ];
  const ws = XLSX.utils.json_to_sheet(template);
  ws['!cols'] = [{wch:12},{wch:15},{wch:16},{wch:15},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws, '管理员导入模板');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('管理员导入模板.xlsx')}`);
  res.send(buf);
});

// 批量导入学生
app.post('/api/admin/import-students', requireAdmin, requireSuper, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    
    if (rows.length === 0) return res.status(400).json({ error: '文件中无数据' });
    
    let successCount = 0, failCount = 0;
    const failures = [];
    
    const insertStmt = db.prepare('INSERT OR IGNORE INTO students (student_id, name, gender, major, class_name, original_class, password, first_login) VALUES (?,?,?,?,?,?,?,1)');
    const updateStmt = db.prepare('UPDATE students SET name=?, gender=?, major=?, class_name=?, original_class=?, password=?, first_login=1 WHERE student_id=?');
    
    const transaction = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const sid = String(r['学号(必填)'] || r['学号'] || '').trim();
        const name = String(r['姓名(必填)'] || r['姓名'] || '').trim();
        const gender = String(r['性别'] || '').trim();
        const major = String(r['专业(大数据/云计算)'] || r['专业'] || '').trim();
        const className = String(r['班级(必填)'] || r['班级'] || '').trim();
        const originalClass = String(r['原班级'] || className).trim();
        
        if (!sid || !name || !className) {
          failCount++; failures.push(`第${i+2}行: 学号/姓名/班级不能为空`); continue;
        }
        if (major && !['大数据','云计算'].includes(major)) {
          failCount++; failures.push(`第${i+2}行(${sid}): 专业必须是"大数据"或"云计算"`); continue;
        }
        
        const defaultPwd = sid;
        const exists = db.prepare('SELECT student_id FROM students WHERE student_id=?').get(sid);
        if (exists) {
          updateStmt.run(name, gender, major, className, originalClass, defaultPwd, sid);
        } else {
          insertStmt.run(sid, name, gender, major, className, originalClass, defaultPwd);
        }
        successCount++;
      }
    });
    transaction();
    
    // Log operation
    const logMsg = `批量导入学生: 成功${successCount}条, 失败${failCount}条`;
    db.prepare("INSERT INTO operation_logs (admin_id, action, detail, created_at) VALUES (?,?,?,datetime('now','localtime'))").run(req.session.user_id, 'import_students', logMsg);
    
    res.json({ success: true, successCount, failCount, failures: failures.slice(0, 50), message: `成功导入 ${successCount} 条, 失败 ${failCount} 条` });
  } catch(e) {
    res.status(500).json({ error: '文件解析失败: ' + e.message });
  }
});

// 批量导入普通管理员
app.post('/api/admin/import-admins', requireAdmin, requireSuper, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传文件' });
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    
    if (rows.length === 0) return res.status(400).json({ error: '文件中无数据' });
    
    let successCount = 0, failCount = 0;
    const failures = [];
    
    const insertStmt = db.prepare('INSERT OR IGNORE INTO admins (username, password, display_name, role) VALUES (?,?,?,?)');
    const updateStmt = db.prepare('UPDATE admins SET password=?, display_name=?, role="normal" WHERE username=?');
    
    // Check for existing super admin usernames
    const superAdmins = new Set(db.prepare("SELECT username FROM admins WHERE role='super'").all().map(r => r.username));
    
    const transaction = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const name = String(r['姓名(必填)'] || r['姓名'] || '').trim();
        const username = String(r['账号(必填)'] || r['账号'] || '').trim();
        const password = String(r['初始密码(必填)'] || r['初始密码'] || '').trim();
        
        if (!name || !username || !password) {
          failCount++; failures.push(`第${i+2}行: 姓名/账号/密码不能为空`); continue;
        }
        if (password.length < 6) {
          failCount++; failures.push(`第${i+2}行(${username}): 密码至少6位`); continue;
        }
        if (superAdmins.has(username)) {
          failCount++; failures.push(`第${i+2}行(${username}): 不能覆盖超级管理员账号`); continue;
        }
        
        const exists = db.prepare('SELECT username FROM admins WHERE username=?').get(username);
        if (exists) {
          updateStmt.run(password, name, username);
        } else {
          insertStmt.run(username, password, name, 'normal');
        }
        successCount++;
      }
    });
    transaction();
    
    const logMsg = `批量导入管理员: 成功${successCount}条, 失败${failCount}条`;
    db.prepare("INSERT INTO operation_logs (admin_id, action, detail, created_at) VALUES (?,?,?,datetime('now','localtime'))").run(req.session.user_id, 'import_admins', logMsg);
    
    res.json({ success: true, successCount, failCount, failures: failures.slice(0, 50), message: `成功导入 ${successCount} 条, 失败 ${failCount} 条` });
  } catch(e) {
    res.status(500).json({ error: '文件解析失败: ' + e.message });
  }
});

// 方向学生明细（点击图表柱子）
app.get('/api/admin/direction-detail', requireAdmin, (req, res) => {
  const direction = req.query.direction || '';
  if (!direction) return res.status(400).json({ error: '请输入方向名称' });
  
  let students;
  if (direction === '未填报') {
    students = db.prepare(`
      SELECT student_id, name, gender, major, class_name
      FROM students WHERE student_id NOT IN (SELECT student_id FROM preferences)
      ORDER BY student_id
    `).all();
  } else if (direction === '新媒体技术方向') {
    students = db.prepare(`
      SELECT s.student_id, s.name, s.gender, s.major, s.class_name
      FROM students s JOIN preferences p ON s.student_id = p.student_id
      WHERE p.choice1 = '新媒体技术方向'
      ORDER BY s.student_id
    `).all();
  } else {
    students = db.prepare(`
      SELECT s.student_id, s.name, s.gender, s.major, s.class_name
      FROM students s JOIN preferences p ON s.student_id = p.student_id
      WHERE p.choice1 = ?
      ORDER BY s.student_id
    `).all(direction);
  }
  
  res.json({ direction, count: students.length, students });
});

// 导出方向学生明细
app.get('/api/admin/export-direction-detail', requireAdmin, (req, res) => {
  const direction = req.query.direction || '';
  if (!direction) return res.status(400).json({ error: '请输入方向名称' });
  
  const XLSX = require('xlsx');
  let students;
  const fields = `s.student_id as 学号, s.name as 姓名, s.gender as 性别, s.major as 专业, s.class_name as 班级,
    p.choice1 as 第一志愿, p.choice2 as 第二志愿, p.choice3 as 第三志愿, p.choice4 as 第四志愿, p.updated_at as 填报时间`;
  
  if (direction === '未填报') {
    students = db.prepare(`SELECT student_id as 学号, name as 姓名, gender as 性别, major as 专业, class_name as 班级,
      '' as 第一志愿, '' as 第二志愿, '' as 第三志愿, '' as 第四志愿, '' as 填报时间
      FROM students WHERE student_id NOT IN (SELECT student_id FROM preferences) ORDER BY student_id`).all();
  } else if (direction === '新媒体技术方向') {
    students = db.prepare(`SELECT ${fields} FROM students s JOIN preferences p ON s.student_id = p.student_id
      WHERE p.choice1 = '新媒体技术方向' ORDER BY s.student_id`).all();
  } else {
    students = db.prepare(`SELECT ${fields} FROM students s JOIN preferences p ON s.student_id = p.student_id
      WHERE p.choice1 = ? ORDER BY s.student_id`).all(direction);
  }
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(students);
  beautifySheet(ws, ['学号','姓名','性别','专业','班级','第一志愿','第二志愿','第三志愿','第四志愿','填报时间']);
  XLSX.utils.book_append_sheet(wb, ws, direction);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(direction + '.xlsx')}`);
  res.send(buf);
});

// 操作日志查询
app.get('/api/admin/operation-logs', requireAdmin, requireSuper, (req, res) => {
  const logs = db.prepare('SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 50').all();
  res.json({ logs });
});

// ==================== 账号管理（超级管理员） ====================

// 查看账号列表
app.get('/api/admin/accounts', requireAdmin, requireSuper, (req, res) => {
  const type = req.query.type || 'students';
  const keyword = req.query.keyword || '';
  const status = req.query.status || '';
  const page = parseInt(req.query.page) || 1;
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  
  let where = '';
  const params = [];
  
  if (type === 'students') {
    where = 'WHERE 1=1';
    if (status) { where += ' AND s.status=?'; params.push(status); }
    if (keyword) { where += ' AND (s.student_id LIKE ? OR s.name LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%'); }
    const count = db.prepare(`SELECT COUNT(*) as c FROM students s ${where}`).all(...params).length > 0 
      ? db.prepare(`SELECT COUNT(*) as c FROM students s ${where}`).get(...params).c : 0;
    // Simpler approach:
    const allStudents = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
    const rows = db.prepare(`SELECT student_id, name, gender, major, class_name, password, status, locked, first_login FROM students s ${where} ORDER BY student_id LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
    const totalCount = db.prepare(`SELECT COUNT(*) as c FROM students s ${where}`).get(...params).c;
    return res.json({ type: 'students', rows, total: totalCount, page, pageSize });
  } else {
    where = 'WHERE 1=1';
    if (status) { where += ' AND a.status=?'; params.push(status); }
    if (keyword) { where += ' AND (a.username LIKE ? OR a.display_name LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%'); }
    const rows = db.prepare(`SELECT a.id, a.username, a.display_name, a.password, a.role, a.status FROM admins a ${where} ORDER BY a.role DESC, a.username LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
    const totalCount = db.prepare(`SELECT COUNT(*) as c FROM admins a ${where}`).get(...params).c;
    return res.json({ type: 'admins', rows, total: totalCount, page, pageSize });
  }
});

// 注销单个账号
app.post('/api/admin/deactivate', requireAdmin, requireSuper, (req, res) => {
  const { type, id, reason } = req.body;
  if (!type || !id) return res.status(400).json({ error: '参数不完整' });
  
  if (type === 'student') {
    // 超级管理员不能注销自己的学生身份... well, admins aren't students
    const s = db.prepare('SELECT * FROM students WHERE student_id=?').get(id);
    if (!s) return res.status(404).json({ error: '学号不存在' });
    if (s.status === 'disabled') return res.status(400).json({ error: '该账号已被注销' });
    db.prepare("UPDATE students SET status='disabled', locked=1 WHERE student_id=?").run(id);
  } else if (type === 'admin') {
    const a = db.prepare('SELECT * FROM admins WHERE id=?').get(id);
    if (!a) return res.status(404).json({ error: '管理员不存在' });
    if (a.role === 'super') return res.status(403).json({ error: '不能注销超级管理员账号' });
    if (a.status === 'disabled') return res.status(400).json({ error: '该账号已被注销' });
    db.prepare("UPDATE admins SET status='disabled' WHERE id=?").run(id);
  } else {
    return res.status(400).json({ error: '无效的账号类型' });
  }
  
  // Log
  db.prepare("INSERT INTO operation_logs (admin_id, action, detail, created_at) VALUES (?,?,?,datetime('now','localtime'))").run(
    req.session.user_id, 'deactivate', `注销${type}: ${id}, 原因: ${reason || '无'}`
  );
  
  res.json({ success: true, message: '注销成功' });
});

// 批量注销
app.post('/api/admin/batch-deactivate', requireAdmin, requireSuper, (req, res) => {
  const { type, ids, reason } = req.body;
  if (!type || !ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择要注销的账号' });
  
  let successCount = 0;
  const failures = [];
  
  if (type === 'student') {
    for (const id of ids) {
      const s = db.prepare('SELECT * FROM students WHERE student_id=?').get(id);
      if (!s) { failures.push(`${id}: 不存在`); continue; }
      if (s.status === 'disabled') { failures.push(`${id}: 已注销`); continue; }
      db.prepare("UPDATE students SET status='disabled', locked=1 WHERE student_id=?").run(id);
      successCount++;
    }
  } else if (type === 'admin') {
    for (const id of ids) {
      const a = db.prepare('SELECT * FROM admins WHERE id=?').get(parseInt(id));
      if (!a) { failures.push(`${id}: 不存在`); continue; }
      if (a.role === 'super') { failures.push(`${a.username}: 超级管理员不可注销`); continue; }
      if (a.status === 'disabled') { failures.push(`${a.username}: 已注销`); continue; }
      db.prepare("UPDATE admins SET status='disabled' WHERE id=?").run(parseInt(id));
      successCount++;
    }
  }
  
  db.prepare("INSERT INTO operation_logs (admin_id, action, detail, created_at) VALUES (?,?,?,datetime('now','localtime'))").run(
    req.session.user_id, 'batch_deactivate', `批量注销${type}: 成功${successCount}条, 失败${failures.length}条, 原因: ${reason || '无'}`
  );
  
  res.json({ success: true, successCount, failures, message: `成功注销 ${successCount} 个账号` });
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`分班系统服务启动成功！`);
  console.log(`入口页面: http://localhost:${PORT}/login.html`);
  console.log(`学生端: http://localhost:${PORT}/student.html`);
  console.log(`管理员端: http://localhost:${PORT}/admin.html`);
});
