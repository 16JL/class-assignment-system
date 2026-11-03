/**
 * 班级分流系统 - 登录页面脚本
 * 功能：烟花粒子动画、水波纹效果、表单验证、密码切换、
 *       记住我、API请求、Token管理、角色跳转
 * @version 3.0
 */

// ===== API Configuration =====
const API_BASE = '';
const API_ENDPOINTS = {
  studentLogin: '/api/student/login',
  adminLogin: '/api/admin/login',
  changePassword: '/api/student/change-password',
  verifyToken: '/api/auth/verify',
  logout: '/api/auth/logout',
};

// ===== Token & Session Management =====
function setSession(token, role, extra = {}) {
  localStorage.setItem('token', token);
  localStorage.setItem('role', role);
  if (extra.username) localStorage.setItem('savedUsername', extra.username);
}

function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('admin_username');
  localStorage.removeItem('admin_displayName');
  localStorage.removeItem('admin_name');
}

function getToken() {
  return localStorage.getItem('token');
}

function getRole() {
  return localStorage.getItem('role');
}

async function verifyAndRedirect() {
  const token = getToken();
  if (!token) return false;

  try {
    const resp = await fetch(API_BASE + API_ENDPOINTS.verifyToken, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      clearSession();
      return false;
    }
    const data = await resp.json();
    // Redirect to role page
    if (data.redirect) {
      window.location.replace(data.redirect);
      return true;
    }
    return false;
  } catch {
    // Server might be down; stay on login page
    return false;
  }
}

/**
 * API 请求函数
 */
async function apiRequest(url, options = {}) {
  const { method = 'POST', body = null, token = null } = options;
  const headers = { 'Content-Type': 'application/json' };
  const authToken = token || getToken();
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  const response = await fetch(API_BASE + url, config);
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || '请求失败');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

// ===== Utilities =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showError(msg) {
  const errorMsg = document.getElementById('errorMsg');
  errorMsg.textContent = msg;
  errorMsg.classList.add('show');
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.classList.remove('loading');
  loginBtn.disabled = false;
}

function clearError() {
  const errorMsg = document.getElementById('errorMsg');
  errorMsg.classList.remove('show');
  errorMsg.textContent = '';
}

// ===== Fireworks / Particle System =====
const canvas = document.getElementById('fireworksCanvas');
const ctx = canvas.getContext('2d');

let particles = [];
let fireworks = [];
let stars = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

for (let i = 0; i < 100; i++) {
  stars.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.5,
    twinkle: Math.random() * Math.PI * 2,
    speed: Math.random() * 0.02 + 0.01
  });
}

class Particle {
  constructor(x, y, color, vx, vy, life, size) {
    this.x = x; this.y = y;
    this.color = color;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.size = size || 3;
    this.gravity = 0.018;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.995;
    this.life--;
  }
  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * (0.4 + alpha * 0.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

const fireworkColors = ['#3b6df0','#2858d6','#e8536c','#22b573','#e8a020','#5b9cf5','#f07090','#60cfff'];

function createFirework(x, y) {
  const color = fireworkColors[Math.floor(Math.random() * fireworkColors.length)];
  const count = 80 + Math.floor(Math.random() * 60);
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.3;
    const speed = Math.random() * 3.5 + 1.5;
    particles.push(new Particle(
      x, y, color,
      Math.cos(angle) * speed, Math.sin(angle) * speed,
      120 + Math.random() * 80,
      Math.random() * 3 + 1.5
    ));
  }
}

class Firework {
  constructor() {
    this.x = Math.random() * canvas.width * 0.85 + canvas.width * 0.075;
    this.y = canvas.height;
    this.targetY = Math.random() * canvas.height * 0.45 + 20;
    this.vy = -(Math.random() * 4 + 5);
    this.trail = [];
    this.color = fireworkColors[Math.floor(Math.random() * fireworkColors.length)];
    this.exploded = false;
  }
  update() {
    if (!this.exploded) {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 15) this.trail.shift();
      this.y += this.vy;
      this.vy += 0.03;
      if (this.y <= this.targetY || this.vy >= 0) {
        createFirework(this.x, this.y);
        this.exploded = true;
      }
    }
  }
  draw(ctx) {
    if (this.exploded) return;
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const alpha = i / this.trail.length;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function spawnFirework() { fireworks.push(new Firework()); }
function scheduleNextFirework() {
  setTimeout(() => { spawnFirework(); scheduleNextFirework(); }, 180 + Math.random() * 350);
}
scheduleNextFirework();

function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  stars.forEach(s => {
    s.twinkle += s.speed;
    const alpha = 0.15 + Math.sin(s.twinkle) * 0.1;
    ctx.fillStyle = `rgba(59,109,240,${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
  fireworks = fireworks.filter(f => !f.exploded || f.trail.length > 0);
  fireworks.forEach(f => { f.update(); f.draw(ctx); });
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(ctx); });
  stars.forEach(s => {
    if (s.x < 0 || s.x > canvas.width || s.y < 0 || s.y > canvas.height) {
      s.x = Math.random() * canvas.width;
      s.y = Math.random() * canvas.height;
    }
  });
  requestAnimationFrame(animate);
}
animate();

canvas.parentElement.addEventListener('click', (e) => {
  if (e.target === canvas || e.target === document.body) {
    createFirework(e.clientX, e.clientY);
  }
});

// ===== Water Ripple Effect =====
const loginCard = document.getElementById('loginCard');
const rippleContainer = document.getElementById('rippleContainer');
let lastRippleTime = 0;
const RIPPLE_THROTTLE = 120;

function createRippleRing(x, y, size, className, delay) {
  const ring = document.createElement('div');
  ring.className = className;
  ring.style.left = x + 'px';
  ring.style.top = y + 'px';
  ring.style.width = size + 'px';
  ring.style.height = size + 'px';
  ring.style.marginLeft = -(size / 2) + 'px';
  ring.style.marginTop = -(size / 2) + 'px';
  ring.style.animationDelay = delay + 'ms';
  ring.style.willChange = 'transform, opacity';
  rippleContainer.appendChild(ring);
  const cleanupTime = 2200 + delay;
  requestAnimationFrame(() => { setTimeout(() => { if (ring.parentNode) ring.remove(); }, cleanupTime); });
}

loginCard.addEventListener('click', function(e) {
  const now = Date.now();
  if (now - lastRippleTime < RIPPLE_THROTTLE) return;
  lastRippleTime = now;
  const rect = loginCard.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const size = Math.max(rect.width, rect.height);
  createRippleRing(x, y, size, 'ripple', 0);
});

// ===== Password Visibility Toggle =====
function createPasswordToggle(toggleBtnId, passwordInputId, eyeIconId) {
  const toggleBtn = document.getElementById(toggleBtnId);
  const passwordInput = document.getElementById(passwordInputId);
  const eyeIcon = document.getElementById(eyeIconId);
  if (!toggleBtn || !passwordInput) return;

  const eyeOpen = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  const eyeClosed = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';

  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    if (eyeIcon) eyeIcon.innerHTML = isPassword ? eyeClosed : eyeOpen;
    toggleBtn.setAttribute('aria-label', isPassword ? '隐藏密码' : '显示密码');
  });
}
createPasswordToggle('toggleStudentPwd', 'studentPassword', 'eyeIconStudent');
createPasswordToggle('toggleAdminPwd', 'adminPassword', 'eyeIconAdmin');

// ===== Role Switch =====
const tabStudent = document.getElementById('tabStudent');
const tabAdmin = document.getElementById('tabAdmin');
const studentFields = document.getElementById('studentFields');
const adminFields = document.getElementById('adminFields');

function switchRole(role) {
  const isStudent = role === 'student';
  tabStudent.classList.toggle('active', isStudent);
  tabAdmin.classList.toggle('active', !isStudent);
  studentFields.style.display = isStudent ? 'block' : 'none';
  adminFields.style.display = isStudent ? 'none' : 'block';
  clearError();
  if (isStudent) {
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
  } else {
    document.getElementById('studentId').value = '';
    document.getElementById('studentPassword').value = '';
  }
}

tabStudent.addEventListener('click', () => switchRole('student'));
tabAdmin.addEventListener('click', () => switchRole('admin'));

// ===== Remember Me =====
const rememberMeCheckbox = document.getElementById('rememberMe');
if (localStorage.getItem('rememberMe') === 'true') {
  rememberMeCheckbox.checked = true;
}
const savedUser = localStorage.getItem('savedUsername');
if (savedUser) {
  document.getElementById('studentId').value = savedUser;
}

rememberMeCheckbox.addEventListener('change', () => {
  if (rememberMeCheckbox.checked) {
    localStorage.setItem('rememberMe', 'true');
  } else {
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('savedUsername');
  }
});

// ===== Validation =====
function validateInput(value, type) {
  if (!value || !value.trim()) return '此项不能为空';
  if (type === 'studentId') {
    if (!/^\d{6,10}$/.test(value.trim())) return '请输入6-10位数字学号';
  }
  return null;
}

document.querySelectorAll('.input-group input').forEach(input => {
  input.addEventListener('blur', function() {
    const inputGroup = this.closest('.input-group');
    if (this.value.trim()) {
      inputGroup.style.setProperty('--input-border', 'rgba(34,181,115,0.4)');
    } else {
      inputGroup.style.removeProperty('--input-border');
    }
  });
  input.addEventListener('input', clearError);
});

// ===== Login Form =====
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const passwordModal = document.getElementById('passwordModal');

let tempToken = null;
let tempUserData = null;

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const isStudent = tabStudent.classList.contains('active');

  if (isStudent) {
    const sid = document.getElementById('studentId').value.trim();
    const pwd = document.getElementById('studentPassword').value;
    const sidError = validateInput(sid, 'studentId');
    if (sidError) { showError(sidError); return; }
    if (!pwd) { showError('请输入密码'); return; }
  } else {
    const username = document.getElementById('adminUsername').value.trim();
    const pwd = document.getElementById('adminPassword').value;
    if (!username) { showError('请输入管理员账号'); return; }
    if (!pwd) { showError('请输入密码'); return; }
  }

  loginBtn.classList.add('loading');
  loginBtn.disabled = true;

  try {
    let data;
    if (isStudent) {
      const sid = document.getElementById('studentId').value.trim();
      const pwd = document.getElementById('studentPassword').value;
      data = await apiRequest(API_ENDPOINTS.studentLogin, {
        method: 'POST',
        body: { studentId: sid, password: pwd }
      });
    } else {
      const username = document.getElementById('adminUsername').value.trim();
      const pwd = document.getElementById('adminPassword').value;
      data = await apiRequest(API_ENDPOINTS.adminLogin, {
        method: 'POST',
        body: { username, password: pwd }
      });
    }

    // Store token and role
    setSession(data.token, data.role, {
      username: isStudent ? document.getElementById('studentId').value.trim() : document.getElementById('adminUsername').value.trim()
    });
    
    // Save admin display name for admin panel
    if (!isStudent && data.admin) {
      localStorage.setItem('admin_name', data.admin.displayName || document.getElementById('adminUsername').value.trim());
      localStorage.setItem('admin_role', data.adminRole || 'super');
    }

    // Remember me
    if (isStudent && rememberMeCheckbox.checked) {
      localStorage.setItem('savedUsername', document.getElementById('studentId').value.trim());
      localStorage.setItem('rememberMe', 'true');
    } else if (!isStudent) {
      localStorage.removeItem('savedUsername');
      localStorage.removeItem('rememberMe');
    }

    if (isStudent && data.firstLogin) {
      tempToken = data.token;
      tempUserData = { ...data.student, student_id: document.getElementById('studentId').value.trim() };
      passwordModal.classList.add('show');
    } else {
      // Jump to respective page
      showToast(data.role === 'student' ? '登录成功' : '管理员登录成功', 'success');
      setTimeout(() => { window.location.replace(data.redirect); }, 500);
    }
  } catch (err) {
    showError(err.message || '网络错误，请重试');
    showToast(err.message || '登录失败，请检查网络连接', 'error');
  }
});


// ===== Forgot Password & Register Links =====
// (Replaced by inline live-data in login.html)


// ===== Password Change Modal =====
const passwordChangeForm = document.getElementById('passwordChangeForm');
const modalError = document.getElementById('modalError');

passwordChangeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalError.textContent = '';

  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  const submitBtn = passwordChangeForm.querySelector('.login-btn');

  if (newPwd.length < 6) {
    modalError.textContent = '密码至少6位';
    return;
  }
  if (newPwd !== confirmPwd) {
    modalError.textContent = '两次密码不一致';
    return;
  }
  if (tempUserData && newPwd === tempUserData.student_id) {
    modalError.textContent = '新密码不能与学号相同';
    return;
  }

  submitBtn.classList.add('loading');
  submitBtn.disabled = true;

  try {
    await apiRequest(API_ENDPOINTS.changePassword, {
      method: 'POST',
      body: { newPassword: newPwd },
      token: tempToken
    });

    // Re-login to get fresh token after password change
    const reLoginData = await apiRequest(API_ENDPOINTS.studentLogin, {
      method: 'POST',
      body: { studentId: tempUserData.student_id, password: newPwd }
    });

    setSession(reLoginData.token, reLoginData.role);
    showToast('密码修改成功，正在跳转...', 'success');
    setTimeout(() => { window.location.replace(reLoginData.redirect); }, 800);
  } catch (err) {
    modalError.textContent = err.message || '网络错误';
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});

passwordModal.addEventListener('click', function(e) {
  if (e.target === passwordModal) {
    showToast('首次登录必须修改密码', 'info');
  }
});

/* ============================================
   ANIMATED CHARACTERS SYSTEM - Enhanced
   ============================================ */
let mx = 0, my = 0;           // raw mouse
let smx = 0, smy = 0;         // smoothed mouse (lerp)
let isTyping = false;
let lookingEachOther = false;
let purpleBlink = false;      // short blink
let blackBlink = false;
let purpleDrowsy = false;     // drowsy half-closed
let blackDrowsy = false;
let purpleEyesClosed = false; // full closure
let blackEyesClosed = false;
let purplePeek = false;
let loginErr = false;
let pwdFocused = false;
let pwdVisible = false;
let idlePupilAngle = 0;       // for idle pupil animation
let typingTimer = null;
let errTimer = null;
let _lastBoundEmail = null, _lastBoundPwd = null;
const shakeEls = () => ['purple-eyes','black-eyes','orange-eyes','yellow-eyes','yellow-mouth','orange-mouth'].map(id => document.getElementById(id)).filter(Boolean);

// Smooth mouse tracking with lerp
document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

function lerpMouse() {
  smx += (mx - smx) * 0.12;
  smy += (my - smy) * 0.12;
  if (!isTyping && !loginErr) updateChars();
  requestAnimationFrame(lerpMouse);
}
lerpMouse();

function activePwd() { return tabStudent.classList.contains('active') ? document.getElementById('studentPassword') : document.getElementById('adminPassword'); }
function activeEmail() { return tabStudent.classList.contains('active') ? document.getElementById('studentId') : document.getElementById('adminUsername'); }

const _origSwitch = switchRole;
switchRole = function(r) { _origSwitch(r); bindCharInputs(); };

function bindCharInputs() {
  const ei = activeEmail(), pi = activePwd();
  if (ei === _lastBoundEmail && pi === _lastBoundPwd) return;
  _lastBoundEmail = ei; _lastBoundPwd = pi;
  ei.addEventListener('focus', () => { isTyping = true; lookingEachOther = true; clearTimeout(typingTimer); typingTimer = setTimeout(() => { lookingEachOther = false; updateChars(); }, 800); updateChars(); });
  ei.addEventListener('blur', () => { isTyping = false; lookingEachOther = false; updateChars(); });
  ei.addEventListener('input', updateChars);
  pi.addEventListener('focus', () => { pwdFocused = true; updateChars(); });
  pi.addEventListener('blur', () => { pwdFocused = false; updateChars(); });
  pi.addEventListener('input', () => { updateChars(); });
}

function hookToggles() {
  [document.getElementById('toggleStudentPwd'), document.getElementById('toggleAdminPwd')].forEach(b => {
    if (!b || b.dataset.charHooked) return;
    b.dataset.charHooked = '1';
    b.addEventListener('click', () => { pwdVisible = !pwdVisible; updateChars(); if (pwdVisible) schedPeek(); });
  });
}

// --- BLINK SYSTEM ---
function eyeHeight(blinking, drowsy, closed, normal) {
  if (closed) return '0px';
  if (blinking) return '1px';
  if (drowsy) return (normal / 3) + 'px';
  return normal + 'px';
}

// Schedule a single blink for a character
function schedBlink(charKey) {
  const isPurple = charKey === 'purple';
  // Random delay between blinks: 2-6 seconds
  const delay = 2000 + Math.random() * 4000;
  setTimeout(() => {
    if (isPurple) purpleBlink = true;
    else blackBlink = true;
    updateChars();
    // Blink duration: 80-200ms
    const dur = 80 + Math.random() * 120;
    setTimeout(() => {
      if (isPurple) purpleBlink = false;
      else blackBlink = false;
      updateChars();
      // Schedule drowsy occasionally (10% chance after blink)
      if (Math.random() < 0.1) {
        if (isPurple) purpleDrowsy = true;
        else blackDrowsy = true;
        updateChars();
        setTimeout(() => {
          if (isPurple) purpleDrowsy = false;
          else blackDrowsy = false;
          updateChars();
          schedBlink(charKey);
        }, 1500 + Math.random() * 2000);
      } else {
        // Occasional long double-blink (5%)
        if (Math.random() < 0.05) {
          if (isPurple) purpleEyesClosed = true;
          else blackEyesClosed = true;
          updateChars();
          setTimeout(() => {
            if (isPurple) purpleEyesClosed = false;
            else blackEyesClosed = false;
            updateChars();
          }, 400 + Math.random() * 600);
        }
        schedBlink(charKey);
      }
    }, dur);
  }, delay);
}

// --- PEEK SYSTEM ---
function schedPeek() {
  const p = activePwd();
  if (!p || p.value.length === 0 || !pwdVisible) return;
  const delay = 1500 + Math.random() * 3000;
  setTimeout(() => {
    if (!pwdVisible || p.value.length === 0) { schedPeek(); return; }
    purplePeek = true;
    // When peeking, eyes go half-open
    purpleDrowsy = false;
    updateChars();
    setTimeout(() => {
      purplePeek = false;
      updateChars();
      schedPeek();
    }, 600 + Math.random() * 800);
  }, delay);
}

// --- POSITION CALC ---
function charPos(el) {
  const r = el.getBoundingClientRect();
  const dx = smx - (r.left + r.width / 2);
  const dy = smy - (r.top + r.height / 3);
  return { fx: Math.max(-15, Math.min(15, dx / 20)), fy: Math.max(-10, Math.min(10, dy / 30)), bs: Math.max(-6, Math.min(6, -dx / 120)) };
}

function pupilOff(el, max) {
  const r = el.getBoundingClientRect();
  const dx = smx - (r.left + r.width / 2);
  const dy = smy - (r.top + r.height / 2);
  const d = Math.min(Math.sqrt(dx * dx + dy * dy), max);
  const a = Math.atan2(dy, dx);
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

// --- MAIN UPDATE ---
function updateChars() {
  const pu = document.getElementById('char-purple'), bl = document.getElementById('char-black');
  const or = document.getElementById('char-orange'), ye = document.getElementById('char-yellow');
  if (!pu) return;

  const pp = charPos(pu), bp = charPos(bl), op = charPos(or), yp = charPos(ye);
  const p = activePwd();
  const pl = p ? p.value.length : 0;
  const showPwd = pl > 0 && pwdVisible;
  const lookAway = pwdFocused && !pwdVisible;

  // Idle pupil drift
  idlePupilAngle += 0.02;
  const idleX = Math.sin(idlePupilAngle) * 0.8;
  const idleY = Math.cos(idlePupilAngle * 1.3) * 0.6;

  // ---- PURPLE ----
  const pHeight = loginErr ? '350px' : showPwd ? (purplePeek ? '380px' : '350px') : lookAway ? '390px' : isTyping ? '390px' : '350px';
  pu.style.height = pHeight;
  pu.style.transform = loginErr ? 'skewX(0deg)' : showPwd ? (purplePeek ? 'skewX(8deg) translateX(10px)' : 'skewX(0deg)') : lookAway ? 'skewX(-14deg) translateX(-20px)' : isTyping ? `skewX(${(pp.bs || 0) - 12}deg) translateX(40px)` : `skewX(${pp.bs}deg)`;

  const pe = document.getElementById('purple-eyes'), pel = document.getElementById('purple-eye-l'), per = document.getElementById('purple-eye-r');
  const ppl = document.getElementById('purple-pupil-l'), ppr = document.getElementById('purple-pupil-r');
  pel.style.height = eyeHeight(purpleBlink, purpleDrowsy, purpleEyesClosed, 18);
  per.style.height = eyeHeight(purpleBlink, purpleDrowsy, purpleEyesClosed, 18);

  if (loginErr) {
    pe.style.left = '30px'; pe.style.top = '55px';
    ppl.style.transform = ppr.style.transform = 'translate(-3px,4px)';
  } else if (lookAway) {
    pe.style.left = '20px'; pe.style.top = '25px';
    ppl.style.transform = ppr.style.transform = 'translate(-5px,-5px)';
  } else if (showPwd) {
    pe.style.left = purplePeek ? '35px' : '20px';
    pe.style.top = purplePeek ? '30px' : '35px';
    const px = purplePeek ? 5 : -4;
    ppl.style.transform = ppr.style.transform = `translate(${px}px,-4px)`;
  } else if (lookingEachOther) {
    pe.style.left = '55px'; pe.style.top = '65px';
    ppl.style.transform = ppr.style.transform = 'translate(3px,4px)';
  } else {
    pe.style.left = (45 + pp.fx) + 'px';
    pe.style.top = (40 + pp.fy) + 'px';
    const o = pupilOff(pel, 5);
    ppl.style.transform = `translate(${o.x + idleX}px,${o.y + idleY}px)`;
    ppr.style.transform = `translate(${o.x + idleX}px,${o.y + idleY}px)`;
  }

  // ---- BLACK ----
  bl.style.transform = loginErr ? 'skewX(0deg)' : showPwd ? 'skewX(0deg)' : lookAway ? 'skewX(12deg) translateX(-10px)' : lookingEachOther ? `skewX(${(bp.bs || 0) * 1.5 + 10}deg) translateX(20px)` : isTyping ? `skewX(${(bp.bs || 0) * 1.5}deg)` : `skewX(${bp.bs}deg)`;

  const be = document.getElementById('black-eyes'), bel = document.getElementById('black-eye-l'), ber = document.getElementById('black-eye-r');
  const bpl = document.getElementById('black-pupil-l'), bpr = document.getElementById('black-pupil-r');
  bel.style.height = eyeHeight(blackBlink, blackDrowsy, blackEyesClosed, 16);
  ber.style.height = eyeHeight(blackBlink, blackDrowsy, blackEyesClosed, 16);

  if (loginErr) {
    be.style.left = '15px'; be.style.top = '40px';
    bpl.style.transform = bpr.style.transform = 'translate(-3px,4px)';
  } else if (lookAway) {
    be.style.left = '10px'; be.style.top = '20px';
    bpl.style.transform = bpr.style.transform = 'translate(-4px,-5px)';
  } else if (showPwd) {
    be.style.left = '10px'; be.style.top = '28px';
    bpl.style.transform = bpr.style.transform = 'translate(-4px,-4px)';
  } else if (lookingEachOther) {
    be.style.left = '32px'; be.style.top = '12px';
    bpl.style.transform = bpr.style.transform = 'translate(0px,-4px)';
  } else {
    be.style.left = (26 + bp.fx) + 'px';
    be.style.top = (32 + bp.fy) + 'px';
    const o = pupilOff(bel, 4);
    bpl.style.transform = `translate(${o.x + idleX * 0.7}px,${o.y + idleY * 0.7}px)`;
    bpr.style.transform = `translate(${o.x + idleX * 0.7}px,${o.y + idleY * 0.7}px)`;
  }

  // ---- ORANGE ----
  or.style.transform = (loginErr || showPwd) ? 'skewX(0deg)' : `skewX(${op.bs}deg)`;
  const oe = document.getElementById('orange-eyes'), opl = document.getElementById('orange-pupil-l'), opr = document.getElementById('orange-pupil-r');
  if (loginErr) { oe.style.left = '60px'; oe.style.top = '95px'; opl.style.transform = opr.style.transform = 'translate(-3px,4px)'; }
  else if (lookAway) { oe.style.left = '50px'; oe.style.top = '75px'; opl.style.transform = opr.style.transform = 'translate(-5px,-5px)'; }
  else if (showPwd) { oe.style.left = '50px'; oe.style.top = '85px'; opl.style.transform = opr.style.transform = 'translate(-5px,-4px)'; }
  else { oe.style.left = (82 + op.fx) + 'px'; oe.style.top = (90 + op.fy) + 'px'; const o = pupilOff(opl, 5); opl.style.transform = `translate(${o.x + idleX * 0.5}px,${o.y + idleY * 0.5}px)`; opr.style.transform = `translate(${o.x + idleX * 0.5}px,${o.y + idleY * 0.5}px)`; }

  // ---- YELLOW ----
  ye.style.transform = (loginErr || showPwd) ? 'skewX(0deg)' : `skewX(${yp.bs}deg)`;
  const yel = document.getElementById('yellow-eyes'), ypl = document.getElementById('yellow-pupil-l'), ypr = document.getElementById('yellow-pupil-r'), ym = document.getElementById('yellow-mouth');
  if (loginErr) { yel.style.left = '35px'; yel.style.top = '45px'; ypl.style.transform = ypr.style.transform = 'translate(-3px,4px)'; ym.style.left = '30px'; ym.style.top = '92px'; ym.style.transform = 'rotate(-8deg)'; }
  else if (lookAway) { yel.style.left = '20px'; yel.style.top = '30px'; ypl.style.transform = ypr.style.transform = 'translate(-5px,-5px)'; ym.style.left = '15px'; ym.style.top = '78px'; ym.style.transform = 'rotate(0deg)'; }
  else if (showPwd) { yel.style.left = '20px'; yel.style.top = '35px'; ypl.style.transform = ypr.style.transform = 'translate(-5px,-4px)'; ym.style.left = '10px'; ym.style.top = '88px'; ym.style.transform = 'rotate(0deg)'; }
  else { yel.style.left = (52 + yp.fx) + 'px'; yel.style.top = (40 + yp.fy) + 'px'; const o = pupilOff(ypl, 5); ypl.style.transform = `translate(${o.x + idleX * 0.6}px,${o.y + idleY * 0.6}px)`; ypr.style.transform = `translate(${o.x + idleX * 0.6}px,${o.y + idleY * 0.6}px)`; ym.style.left = (40 + yp.fx) + 'px'; ym.style.top = (88 + yp.fy) + 'px'; ym.style.transform = 'rotate(0deg)'; }
}

// --- ERROR ANIMATION ---
function triggerErrorAnim() {
  if (errTimer) { clearTimeout(errTimer); errTimer = null; }
  const els = shakeEls(); els.forEach(e => e.classList.remove('shake-head'));
  void document.body.offsetHeight;
  loginErr = true; pwdFocused = false; updateChars();
  const om = document.getElementById('orange-mouth'); if (om) om.classList.add('visible');
  setTimeout(() => els.forEach(e => e.classList.add('shake-head')), 350);
  errTimer = setTimeout(() => {
    loginErr = false; errTimer = null;
    const m = document.getElementById('orange-mouth'); if (m) m.classList.remove('visible');
    els.forEach(e => e.classList.remove('shake-head')); updateChars();
  }, 2500);
}

const _origErr = showError;
showError = function(m) { _origErr(m); triggerErrorAnim(); };

function initChars() {
  schedBlink('purple'); schedBlink('black');
  bindCharInputs(); hookToggles(); updateChars();
}
initChars();

// ===== Keyboard shortcut =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement.tagName === 'INPUT') {
    const form = document.activeElement.closest('form');
    if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
  }
});

// ===== Init: check existing token =====
(async function init() {
  const token = getToken();
  if (token) {
    const redirected = await verifyAndRedirect();
    // If not redirected (server down or invalid token), clear and stay
    if (!redirected) {
      clearSession();
    }
  }
})();
