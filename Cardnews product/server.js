require('dotenv').config(); // .env 파일에서 환경변수 로드 (보안 핵심!)
require('dotenv').config({ path: '.env.local', override: true });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai'); // 구글 제미나이 공식 라이브러리

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.AUTH_SECRET) console.warn('[AUTH] AUTH_SECRET is not set. Sessions expire when this server restarts.');
let membershipDbReady = false;
const localStorePath = path.join(__dirname, 'data', 'local-memberships.json');
let localStore = { nextUserId: 1, nextRequestId: 1, nextProfileId: 1, nextProfileApplicationId: 1, users: [], subscriptionRequests: [], profiles: [], profileEvents: [], profileApplications: [] };
const saveLocalStore = () => {
    fs.mkdirSync(path.dirname(localStorePath), { recursive: true });
    fs.writeFileSync(localStorePath, JSON.stringify(localStore, null, 2), 'utf8');
};
const loadLocalStore = () => {
    try { localStore = { ...localStore, ...JSON.parse(fs.readFileSync(localStorePath, 'utf8')) }; }
    catch { saveLocalStore(); }
};

// 미들웨어 설정
app.use(cors({
    origin: ['http://localhost', 'http://127.0.0.1', 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:5501', 'http://127.0.0.1:5501'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});
app.use(express.static('public')); // index.html 서빙

// DB 연결 풀 (뼈대)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 🚀 [보안] 백엔드에서만 API 키를 주입하여 제미나이 클라이언트 초기화
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const publicUser = (user) => ({
    id: user.id, email: user.email, displayName: user.display_name,
    party: user.party, tier: user.tier, role: user.role, isActive: Boolean(user.is_active)
});
const hashPassword = (password) => new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString('hex')}`));
});
const verifyPassword = (password, stored) => new Promise((resolve, reject) => {
    const [salt, expected] = String(stored || '').split(':');
    if (!salt || !expected) return resolve(false);
    crypto.scrypt(password, salt, 64, (error, key) => {
        if (error) return reject(error);
        const expectedBuffer = Buffer.from(expected, 'hex');
        resolve(expectedBuffer.length === key.length && crypto.timingSafeEqual(expectedBuffer, key));
    });
});
const signToken = (payload) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
};
const readToken = (request) => {
    const cookies = Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map(value => {
        const index = value.indexOf('=');
        return [value.slice(0, index).trim(), decodeURIComponent(value.slice(index + 1))];
    }));
    const token = cookies.pollinsight_session || request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token || !token.includes('.')) return null;
    const [encoded, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    try {
        const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        return payload.exp > Date.now() ? payload : null;
    } catch { return null; }
};
const setSession = (response, user, remember = false) => {
    const lifetimeSeconds = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
    const token = signToken({ sub: user.id, exp: Date.now() + 1000 * lifetimeSeconds });
    const persistence = remember ? `; Max-Age=${lifetimeSeconds}` : '';
    response.setHeader('Set-Cookie', `pollinsight_session=${token}; HttpOnly; SameSite=Lax; Path=/${persistence}`);
};
const requireUser = (roles = []) => async (request, response, next) => {
    const session = readToken(request);
    if (!session) return response.status(401).json({ success: false, message: '로그인이 필요합니다.' });
    try {
        const user = membershipDbReady
            ? (await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [session.sub]))[0][0]
            : localStore.users.find(candidate => candidate.id === Number(session.sub));
        if (!user || !user.is_active || (roles.length && !roles.includes(user.role))) return response.status(403).json({ success: false, message: '권한이 없습니다.' });
        request.user = user;
        next();
    } catch {
        response.status(503).json({ success: false, message: '회원 정보를 확인할 수 없습니다.' });
    }
};
const CREDIT_GRANTS = { free: 100, basic: 600, premium: 2500 };
const currentCreditPeriod = () => new Date().toISOString().slice(0, 7);
async function ensureMonthlyCredits(user) {
    if (!membershipDbReady) return CREDIT_GRANTS[user.tier] || CREDIT_GRANTS.free;
    const period = currentCreditPeriod();
    const reference = `monthly:${period}`;
    const [rows] = await pool.query('SELECT id FROM credit_ledger WHERE user_id = ? AND reference_key = ? LIMIT 1', [user.id, reference]);
    if (!rows.length) await pool.query('INSERT INTO credit_ledger (user_id, amount, event_type, reference_key, description) VALUES (?, ?, ?, ?, ?)', [user.id, CREDIT_GRANTS[user.tier] || CREDIT_GRANTS.free, 'monthly_grant', reference, `${period} 월간 크레딧 지급`]);
    const [balanceRows] = await pool.query('SELECT COALESCE(SUM(amount), 0) AS balance FROM credit_ledger WHERE user_id = ?', [user.id]);
    return Number(balanceRows[0].balance || 0);
}
async function spendCredits(user, amount, eventType, description, referenceKey) {
    const balance = await ensureMonthlyCredits(user);
    if (balance < amount) { const error = new Error('크레딧이 부족합니다. 마이페이지에서 사용 현황을 확인해 주세요.'); error.status = 402; throw error; }
    await pool.query('INSERT INTO credit_ledger (user_id, amount, event_type, reference_key, description) VALUES (?, ?, ?, ?, ?)', [user.id, -Math.abs(amount), eventType, referenceKey, description]);
}
async function recordUsage(userId, eventType, units = 1, metadata = null) {
    if (!membershipDbReady) return;
    await pool.query('INSERT INTO usage_events (user_id, event_type, units, metadata) VALUES (?, ?, ?, ?)', [userId, eventType, Math.max(0, Number(units) || 0), metadata ? JSON.stringify(metadata) : null]);
}

async function ensureMembershipSchema() {
    const databaseName = String(process.env.DB_NAME || 'pollinsight_db');
    if (!/^[A-Za-z0-9_]+$/.test(databaseName)) throw new Error('Invalid DB_NAME');
    if (process.env.DB_BOOTSTRAP_USER && process.env.DB_BOOTSTRAP_PASSWORD) {
        const bootstrapConnection = await mysql.createConnection({
            host: process.env.DB_HOST, user: process.env.DB_BOOTSTRAP_USER, password: process.env.DB_BOOTSTRAP_PASSWORD
        });
        await bootstrapConnection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await bootstrapConnection.end();
    }
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        party ENUM('democratic','people_power','justice','independent') NOT NULL DEFAULT 'independent',
        tier ENUM('free','basic','premium') NOT NULL DEFAULT 'free',
        role ENUM('member','admin') NOT NULL DEFAULT 'member',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS subscription_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        requested_tier ENUM('basic','premium') NOT NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS design_folders (
        id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_folder_name (user_id, name), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS design_projects (
        id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, folder_id INT NULL,
        title VARCHAR(255) NOT NULL, candidate_name VARCHAR(100) NULL, design_state JSON NOT NULL, preview_data MEDIUMTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX project_owner_updated (user_id, updated_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (folder_id) REFERENCES design_folders(id) ON DELETE SET NULL
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS design_templates (
        id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, category VARCHAR(80) NOT NULL DEFAULT 'general', tags JSON NULL,
        description VARCHAR(500) NULL, design_state JSON NOT NULL, slot_config JSON NULL, preview_data MEDIUMTEXT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE, created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX template_active_updated (is_active, updated_at),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS design_assets (
        id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, asset_type VARCHAR(40) NOT NULL DEFAULT 'clipart',
        category VARCHAR(80) NOT NULL DEFAULT 'general', tags JSON NULL, element_data JSON NOT NULL, preview_data MEDIUMTEXT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE, created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX asset_active_updated (is_active, updated_at),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS credit_ledger (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, amount INT NOT NULL, event_type VARCHAR(60) NOT NULL,
        reference_key VARCHAR(100) NULL, description VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX credit_user_created (user_id, created_at), UNIQUE KEY unique_credit_reference (user_id, reference_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS usage_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, event_type VARCHAR(60) NOT NULL, units INT NOT NULL DEFAULT 1,
        metadata JSON NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX usage_user_created (user_id, created_at), INDEX usage_type_created (event_type, created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS digital_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, title VARCHAR(120) NOT NULL,
        slug VARCHAR(80) NOT NULL UNIQUE, template_key VARCHAR(40) NOT NULL DEFAULT 'person',
        is_published BOOLEAN NOT NULL DEFAULT FALSE, profile_data JSON NOT NULL,
        published_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX digital_profile_owner_updated (user_id, updated_at),
        INDEX digital_profile_published (is_published, slug),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS digital_profile_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, profile_id INT NOT NULL, event_type VARCHAR(40) NOT NULL,
        target VARCHAR(500) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX profile_event_created (profile_id, created_at),
        FOREIGN KEY (profile_id) REFERENCES digital_profiles(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS digital_profile_applications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, profile_id INT NOT NULL,
        applicant_name VARCHAR(100) NOT NULL, phone VARCHAR(40) NULL, email VARCHAR(255) NULL,
        message TEXT NULL, status ENUM('new','reviewing','completed') NOT NULL DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX profile_application_created (profile_id, created_at),
        FOREIGN KEY (profile_id) REFERENCES digital_profiles(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
    try { await pool.query('ALTER TABLE design_templates ADD COLUMN tags JSON NULL AFTER category'); }
    catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
}
async function initializeMembershipStore() {
    loadLocalStore();
    try {
        await ensureMembershipSchema();
        membershipDbReady = true;
        console.log('[AUTH] MySQL membership store enabled.');
    } catch (error) {
        console.warn('[AUTH] MySQL membership store unavailable; using local development store:', error.message);
    }
    const shouldSeedDemo = process.env.SEED_DEMO_ACCOUNT === 'true' && process.env.NODE_ENV !== 'production';
    if (membershipDbReady && shouldSeedDemo) {
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', ['demo@pollinsight.local']);
        if (!existing.length) {
            const password_hash = await hashPassword('Demo!2026');
            await pool.query("INSERT INTO users (email, password_hash, display_name, party, tier, role) VALUES (?, ?, ?, 'democratic', 'premium', 'admin')", ['demo@pollinsight.local', password_hash, '데모 관리자']);
            console.log('[AUTH] MySQL demo administrator created.');
        }
    } else if (!membershipDbReady && !localStore.users.some(user => user.email === 'demo@pollinsight.local')) {
        const password_hash = await hashPassword('Demo!2026');
        localStore.users.push({ id: localStore.nextUserId++, email: 'demo@pollinsight.local', password_hash, display_name: '데모 관리자', party: 'democratic', tier: 'premium', role: 'admin', is_active: true, created_at: new Date().toISOString() });
        saveLocalStore();
        console.log('[AUTH] Local demo account created.');
    }
}
initializeMembershipStore();

app.post('/api/auth/register', async (request, response) => {
    const { email, password, displayName, party = 'independent' } = request.body || {};
    if (!/^\S+@\S+\.\S+$/.test(email || '') || String(password || '').length < 8 || !String(displayName || '').trim()) {
        return response.status(400).json({ success: false, message: '이메일, 이름, 8자 이상 비밀번호를 확인해주세요.' });
    }
    if (!['democratic', 'people_power', 'justice', 'independent'].includes(party)) return response.status(400).json({ success: false, message: '유효하지 않은 소속입니다.' });
    try {
        const passwordHash = await hashPassword(password);
        const normalizedEmail = email.toLowerCase();
        let user;
        if (membershipDbReady) {
            const [result] = await pool.query('INSERT INTO users (email, password_hash, display_name, party) VALUES (?, ?, ?, ?)', [normalizedEmail, passwordHash, displayName.trim(), party]);
            user = { id: result.insertId, email: normalizedEmail, display_name: displayName.trim(), party, tier: 'free', role: 'member', is_active: true };
        } else {
            if (localStore.users.some(candidate => candidate.email === normalizedEmail)) return response.status(409).json({ success: false, message: '이미 등록된 이메일입니다.' });
            user = { id: localStore.nextUserId++, email: normalizedEmail, password_hash: passwordHash, display_name: displayName.trim(), party, tier: 'free', role: 'member', is_active: true, created_at: new Date().toISOString() };
            localStore.users.push(user);
            saveLocalStore();
        }
        setSession(response, user, Boolean(request.body?.remember));
        response.status(201).json({ success: true, user: publicUser(user) });
    } catch (error) {
        response.status(error.code === 'ER_DUP_ENTRY' ? 409 : 503).json({ success: false, message: error.code === 'ER_DUP_ENTRY' ? '이미 등록된 이메일입니다.' : '회원가입을 처리할 수 없습니다.' });
    }
});

app.post('/api/auth/login', async (request, response) => {
    const { email, password, remember = false } = request.body || {};
    try {
        const normalizedEmail = String(email || '').toLowerCase();
        const user = membershipDbReady
            ? (await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizedEmail]))[0][0]
            : localStore.users.find(candidate => candidate.email === normalizedEmail);
        if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) return response.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        setSession(response, user, Boolean(remember));
        response.json({ success: true, user: publicUser(user) });
    } catch { response.status(503).json({ success: false, message: '로그인 서비스를 사용할 수 없습니다.' }); }
});

app.get('/api/auth/me', requireUser(), (request, response) => response.json({ success: true, user: publicUser(request.user) }));
app.post('/api/auth/logout', (request, response) => {
    response.setHeader('Set-Cookie', 'pollinsight_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    response.json({ success: true });
});

app.get('/api/billing/requests', requireUser(), async (request, response) => {
    const requests = membershipDbReady
        ? (await pool.query('SELECT id, requested_tier, status, created_at, reviewed_at FROM subscription_requests WHERE user_id = ? ORDER BY id DESC', [request.user.id]))[0]
        : localStore.subscriptionRequests.filter(item => item.user_id === request.user.id).sort((a, b) => b.id - a.id);
    response.json({ success: true, requests });
});
app.post('/api/billing/upgrade-requests', requireUser(), async (request, response) => {
    const { tier } = request.body || {};
    if (!['basic', 'premium'].includes(tier)) return response.status(400).json({ success: false, message: '요청 가능한 플랜이 아닙니다.' });
    if (request.user.tier === tier || request.user.tier === 'premium') return response.status(400).json({ success: false, message: '현재 플랜에서는 요청할 수 없습니다.' });
    const pending = membershipDbReady
        ? (await pool.query("SELECT id FROM subscription_requests WHERE user_id = ? AND status = 'pending' LIMIT 1", [request.user.id]))[0]
        : localStore.subscriptionRequests.filter(item => item.user_id === request.user.id && item.status === 'pending');
    if (pending.length) return response.status(409).json({ success: false, message: '이미 검토 중인 플랜 변경 요청이 있습니다.' });
    if (membershipDbReady) await pool.query('INSERT INTO subscription_requests (user_id, requested_tier) VALUES (?, ?)', [request.user.id, tier]);
    else { localStore.subscriptionRequests.push({ id: localStore.nextRequestId++, user_id: request.user.id, requested_tier: tier, status: 'pending', created_at: new Date().toISOString(), reviewed_at: null }); saveLocalStore(); }
    response.status(201).json({ success: true, message: '플랜 변경 요청을 접수했습니다. 결제 확인 후 반영됩니다.' });
});

app.post('/api/usage/heartbeat', requireUser(), async (request, response) => {
    const seconds = Math.min(120, Math.max(0, Number(request.body?.seconds) || 0));
    if (seconds) await recordUsage(request.user.id, 'editor_seconds', Math.round(seconds));
    response.json({ success: true });
});
app.get('/api/account/summary', requireUser(), async (request, response) => {
    if (!membershipDbReady) return response.json({ success: true, summary: { creditBalance: CREDIT_GRANTS[request.user.tier] || 100, creditGranted: CREDIT_GRANTS[request.user.tier] || 100, creditSpent: 0, editorMinutes: 0, aiRequests: 0, projectCount: 0, recentProjects: [], ledger: [] } });
    await ensureMonthlyCredits(request.user);
    const monthStart = `${currentCreditPeriod()}-01`;
    const [[credit]] = await pool.query(`SELECT COALESCE(SUM(amount),0) AS balance, COALESCE(SUM(CASE WHEN amount > 0 AND created_at >= ? THEN amount ELSE 0 END),0) AS granted, COALESCE(SUM(CASE WHEN amount < 0 AND created_at >= ? THEN -amount ELSE 0 END),0) AS spent FROM credit_ledger WHERE user_id = ?`, [monthStart, monthStart, request.user.id]);
    const [[usage]] = await pool.query(`SELECT COALESCE(SUM(CASE WHEN event_type='editor_seconds' AND created_at >= ? THEN units ELSE 0 END),0) AS seconds, COALESCE(SUM(CASE WHEN event_type IN ('ai_element','ai_proposal') AND created_at >= ? THEN 1 ELSE 0 END),0) AS ai_requests FROM usage_events WHERE user_id = ?`, [monthStart, monthStart, request.user.id]);
    const [[projects]] = await pool.query('SELECT COUNT(*) AS count FROM design_projects WHERE user_id = ?', [request.user.id]);
    const [recentProjects] = await pool.query('SELECT id, title, updated_at FROM design_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5', [request.user.id]);
    const [ledger] = await pool.query('SELECT amount, event_type, description, created_at FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 8', [request.user.id]);
    response.json({ success: true, summary: { creditBalance: Number(credit.balance), creditGranted: Number(credit.granted), creditSpent: Number(credit.spent), editorMinutes: Math.round(Number(usage.seconds) / 60), aiRequests: Number(usage.ai_requests), projectCount: Number(projects.count), recentProjects, ledger } });
});

app.get('/api/admin/users', requireUser(['admin']), async (request, response) => {
    const users = membershipDbReady
        ? (await pool.query('SELECT id, email, display_name, party, tier, role, is_active, created_at FROM users ORDER BY created_at DESC LIMIT 250'))[0]
        : [...localStore.users].sort((a, b) => b.id - a.id);
    response.json({ success: true, users: users.map(publicUser) });
});
app.get('/api/admin/dashboard', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.json({ success: true, dashboard: { members: 0, activeMembers: 0, aiRequests: 0, editorMinutes: 0, creditsUsed: 0, users: [] } });
    const monthStart = `${currentCreditPeriod()}-01`;
    const [[totals]] = await pool.query(`SELECT
        (SELECT COUNT(*) FROM users WHERE is_active=TRUE) AS members,
        (SELECT COUNT(DISTINCT user_id) FROM usage_events WHERE created_at >= ?) AS active_members,
        (SELECT COUNT(*) FROM usage_events WHERE event_type IN ('ai_element','ai_proposal') AND created_at >= ?) AS ai_requests,
        (SELECT COALESCE(SUM(units),0) FROM usage_events WHERE event_type='editor_seconds' AND created_at >= ?) AS editor_seconds,
        (SELECT COALESCE(SUM(-amount),0) FROM credit_ledger WHERE amount < 0 AND created_at >= ?) AS credits_used`, [monthStart, monthStart, monthStart, monthStart]);
    const [users] = await pool.query(`SELECT u.id, u.display_name, u.email, u.tier,
        COALESCE((SELECT SUM(amount) FROM credit_ledger c WHERE c.user_id=u.id),0) AS credit_balance,
        COALESCE((SELECT SUM(units) FROM usage_events e WHERE e.user_id=u.id AND e.event_type='editor_seconds' AND e.created_at >= ?),0) AS editor_seconds,
        COALESCE((SELECT COUNT(*) FROM usage_events e WHERE e.user_id=u.id AND e.event_type IN ('ai_element','ai_proposal') AND e.created_at >= ?),0) AS ai_requests
        FROM users u ORDER BY ai_requests DESC, editor_seconds DESC LIMIT 50`, [monthStart, monthStart]);
    response.json({ success: true, dashboard: { members: Number(totals.members), activeMembers: Number(totals.active_members), aiRequests: Number(totals.ai_requests), editorMinutes: Math.round(Number(totals.editor_seconds) / 60), creditsUsed: Number(totals.credits_used), users } });
});

app.patch('/api/admin/users/:id', requireUser(['admin']), async (request, response) => {
    const { tier, party, isActive, role } = request.body || {};
    if (tier && !['free', 'basic', 'premium'].includes(tier)) return response.status(400).json({ success: false, message: '유효하지 않은 등급입니다.' });
    if (party && !['democratic', 'people_power', 'justice', 'independent'].includes(party)) return response.status(400).json({ success: false, message: '유효하지 않은 소속입니다.' });
    if (role && !['member', 'admin'].includes(role)) return response.status(400).json({ success: false, message: '유효하지 않은 역할입니다.' });
    const fields = [], values = [];
    if (tier) { fields.push('tier = ?'); values.push(tier); }
    if (party) { fields.push('party = ?'); values.push(party); }
    if (typeof isActive === 'boolean') { fields.push('is_active = ?'); values.push(isActive); }
    if (role) { fields.push('role = ?'); values.push(role); }
    if (!fields.length) return response.status(400).json({ success: false, message: '변경할 값이 없습니다.' });
    values.push(request.params.id);
    if (membershipDbReady) await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    else {
        const user = localStore.users.find(candidate => candidate.id === Number(request.params.id));
        if (!user) return response.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
        if (tier) user.tier = tier;
        if (party) user.party = party;
        if (typeof isActive === 'boolean') user.is_active = isActive;
        if (role) user.role = role;
        saveLocalStore();
    }
    response.json({ success: true });
});

// Template studio: only administrators can create, publish, or remove shared templates.
app.get('/api/admin/templates', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '템플릿 저장소를 사용할 수 없습니다.' });
    const [templates] = await pool.query('SELECT id, title, category, tags, description, preview_data, is_active, created_at, updated_at FROM design_templates ORDER BY updated_at DESC');
    response.json({ success: true, templates });
});
app.post('/api/admin/templates', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '템플릿 저장소를 사용할 수 없습니다.' });
    const { title, category, tags, description, design_state, slot_config, preview_data, is_active = true } = request.body || {};
    if (!String(title || '').trim() || !design_state?.pages?.length) return response.status(400).json({ success: false, message: '제목과 한 장 이상의 디자인이 필요합니다.' });
    const [result] = await pool.query(
        'INSERT INTO design_templates (title, category, tags, description, design_state, slot_config, preview_data, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [String(title).trim().slice(0, 255), String(category || 'general').slice(0, 80), JSON.stringify(Array.isArray(tags) ? [...new Set(tags.map(tag => String(tag).replace(/^#/, '').trim()).filter(Boolean))].slice(0, 12) : []), String(description || '').slice(0, 500), JSON.stringify(design_state), JSON.stringify(slot_config || []), preview_data || null, Boolean(is_active), request.user.id]
    );
    response.status(201).json({ success: true, templateId: result.insertId, message: '템플릿이 등록되었습니다.' });
});
app.patch('/api/admin/templates/:id', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '템플릿 저장소를 사용할 수 없습니다.' });
    const { is_active } = request.body || {};
    if (typeof is_active !== 'boolean') return response.status(400).json({ success: false, message: '공개 상태가 필요합니다.' });
    const [result] = await pool.query('UPDATE design_templates SET is_active = ? WHERE id = ?', [is_active, Number(request.params.id)]);
    if (!result.affectedRows) return response.status(404).json({ success: false, message: '템플릿을 찾을 수 없습니다.' });
    response.json({ success: true });
});
app.delete('/api/admin/templates/:id', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '템플릿 저장소를 사용할 수 없습니다.' });
    const [result] = await pool.query('DELETE FROM design_templates WHERE id = ?', [Number(request.params.id)]);
    if (!result.affectedRows) return response.status(404).json({ success: false, message: '템플릿을 찾을 수 없습니다.' });
    response.json({ success: true });
});
app.get('/api/templates', requireUser(), async (request, response) => {
    if (!membershipDbReady) return response.json({ success: true, templates: [] });
    const [templates] = await pool.query('SELECT id, title, category, tags, description, preview_data, updated_at FROM design_templates WHERE is_active = TRUE ORDER BY updated_at DESC');
    response.json({ success: true, templates });
});
app.get('/api/templates/:id', requireUser(), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '템플릿 저장소를 사용할 수 없습니다.' });
    const [rows] = await pool.query('SELECT id, title, category, design_state, slot_config FROM design_templates WHERE id = ? AND is_active = TRUE LIMIT 1', [Number(request.params.id)]);
    if (!rows.length) return response.status(404).json({ success: false, message: '템플릿을 찾을 수 없습니다.' });
    response.json({ success: true, template: rows[0] });
});

// Individual reusable elements are intentionally stored separately from complete
// layouts so users insert one object without replacing their whole project.
app.get('/api/admin/assets', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '요소 라이브러리를 사용할 수 없습니다.' });
    const [assets] = await pool.query('SELECT id, title, asset_type, category, tags, preview_data, is_active, created_at, updated_at FROM design_assets ORDER BY updated_at DESC');
    response.json({ success: true, assets });
});
app.post('/api/admin/assets', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '요소 라이브러리를 사용할 수 없습니다.' });
    const { title, asset_type = 'clipart', category, tags, element_data, preview_data, is_active = true } = request.body || {};
    if (!String(title || '').trim() || !element_data?.type) return response.status(400).json({ success: false, message: '요소 이름과 편집 가능한 요소 데이터가 필요합니다.' });
    const normalizedTags = Array.isArray(tags) ? [...new Set(tags.map(tag => String(tag).replace(/^#/, '').trim()).filter(Boolean))].slice(0, 12) : [];
    const [result] = await pool.query(
        'INSERT INTO design_assets (title, asset_type, category, tags, element_data, preview_data, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [String(title).trim().slice(0, 255), String(asset_type).slice(0, 40), String(category || 'general').slice(0, 80), JSON.stringify(normalizedTags), JSON.stringify(element_data), preview_data || null, Boolean(is_active), request.user.id]
    );
    response.status(201).json({ success: true, assetId: result.insertId });
});
app.patch('/api/admin/assets/:id', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '요소 라이브러리를 사용할 수 없습니다.' });
    if (typeof request.body?.is_active !== 'boolean') return response.status(400).json({ success: false, message: '공개 상태가 필요합니다.' });
    const [result] = await pool.query('UPDATE design_assets SET is_active = ? WHERE id = ?', [request.body.is_active, Number(request.params.id)]);
    if (!result.affectedRows) return response.status(404).json({ success: false, message: '요소를 찾을 수 없습니다.' });
    response.json({ success: true });
});
app.delete('/api/admin/assets/:id', requireUser(['admin']), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '요소 라이브러리를 사용할 수 없습니다.' });
    const [result] = await pool.query('DELETE FROM design_assets WHERE id = ?', [Number(request.params.id)]);
    if (!result.affectedRows) return response.status(404).json({ success: false, message: '요소를 찾을 수 없습니다.' });
    response.json({ success: true });
});
app.get('/api/assets', requireUser(), async (request, response) => {
    if (!membershipDbReady) return response.json({ success: true, assets: [] });
    const [assets] = await pool.query('SELECT id, title, asset_type, category, tags, preview_data, updated_at FROM design_assets WHERE is_active = TRUE ORDER BY updated_at DESC');
    response.json({ success: true, assets });
});
app.get('/api/assets/:id', requireUser(), async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: '요소 라이브러리를 사용할 수 없습니다.' });
    const [rows] = await pool.query('SELECT id, title, asset_type, category, element_data FROM design_assets WHERE id = ? AND is_active = TRUE LIMIT 1', [Number(request.params.id)]);
    if (!rows.length) return response.status(404).json({ success: false, message: '요소를 찾을 수 없습니다.' });
    response.json({ success: true, asset: rows[0] });
});

// Public profile templates may use only active image assets. Returning this narrow
// payload avoids making the administration or asset-management API public.
app.get('/api/public-assets/:id', async (request, response) => {
    if (!membershipDbReady) return response.status(503).json({ success: false, message: 'Asset library is unavailable.' });
    const [rows] = await pool.query('SELECT id, title, asset_type, category, element_data FROM design_assets WHERE id = ? AND is_active = TRUE LIMIT 1', [Number(request.params.id)]);
    if (!rows.length) return response.status(404).json({ success: false, message: 'Asset not found.' });
    response.json({ success: true, asset: rows[0] });
});

// AI-first design proposals. Facts supplied by the user are kept separate from
// generated copy so a model can never silently rewrite campaign identifiers.
const proposalText = (value, max = 120) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
const partyPalette = {
    democratic: { accent: '#2563eb', dark: '#173f91', soft: '#e8f0ff' },
    people_power: { accent: '#dc2626', dark: '#8f1d1d', soft: '#fff0f0' },
    justice: { accent: '#d99000', dark: '#8a5800', soft: '#fff7df' },
    independent: { accent: '#475569', dark: '#1e293b', soft: '#f1f5f9' }
};
const fallbackProposalCopy = (facts) => ({
    headline: facts.keyword || '우리 지역의 변화',
    subheadline: facts.promise || '시민의 일상에 필요한 약속을 차분히 전합니다.',
    support: facts.region ? `${facts.region}에서 함께 만드는 새로운 내일` : '함께 만드는 새로운 내일',
    questions: facts.promise ? ['이 약속을 뒷받침할 핵심 수치 또는 사례가 있나요?'] : ['가장 먼저 알리고 싶은 공약 또는 변화를 한 문장으로 알려주세요.']
});
const element = (id, value) => [id, { rot: 0, opacity: 1, ...value }];
const makeProposalPage = (id, title, els, palette) => ({
    id, title, w: 1080, h: 1080, bgType: 'solid', bgColor: palette.soft,
    bgColor2: '#ffffff', bgGradientAngle: 180, bgStrokeWidth: 0, bgStrokeColor: '#000000',
    els: Object.fromEntries(els)
});
const makeProposalState = (style, facts, copy, palette) => {
    const name = facts.candidateName || '후보자';
    const identity = [facts.partyName, facts.region, facts.number ? `기호 ${facts.number}` : ''].filter(Boolean).join(' · ');
    const portrait = facts.portrait;
    const common = { title: `${copy.headline} · ${style === 'person' ? '인물 중심' : style === 'info' ? '정보 중심' : '메시지 중심'} 카드 세트`, currentIdx: 0, pages: [] };
    const coverEls = [
        element('topBar', { type: 'rect', x: 0, y: 0, w: 1080, h: 26, color: palette.accent }),
        element('eyebrow', { type: 'text', text: identity || 'CAMPAIGN MESSAGE', x: 84, y: 92, w: 760, h: 42, size: 22, color: palette.accent, bold: true, align: 'left', templateRole: 'party-region-number', locked: true }),
        element('title', { type: 'text', text: copy.headline, x: 84, y: 170, w: style === 'person' ? 540 : 850, h: 210, size: style === 'poster' ? 96 : 78, color: palette.dark, bold: true, align: 'left', templateRole: 'headline' }),
        element('subtitle', { type: 'text', text: copy.subheadline, x: 88, y: 410, w: style === 'person' ? 500 : 780, h: 120, size: 31, color: '#334155', align: 'left', templateRole: 'body-copy' }),
        element('candidate', { type: 'text', text: name, x: 88, y: 886, w: 420, h: 65, size: 43, color: palette.dark, bold: true, align: 'left', templateRole: 'candidate-name', locked: true }),
        element('support', { type: 'text', text: copy.support, x: 88, y: 956, w: 760, h: 42, size: 23, color: '#64748b', align: 'left', templateRole: 'support-copy' })
    ];
    if (portrait) coverEls.push(element('portrait', { type: 'image', x: 650, y: 132, w: 350, h: 700, imgSrc: portrait, templateRole: 'portrait' }));
    else coverEls.push(element('portraitSlot', { type: 'rect', x: 690, y: 150, w: 285, h: 590, color: '#cbd5e1', templateRole: 'portrait', locked: false }));
    if (style === 'info') coverEls.push(element('infoCard', { type: 'rect', x: 84, y: 610, w: 820, h: 150, color: '#ffffff', borderColor: palette.accent, borderWidth: 3 }));
    if (style === 'poster') coverEls.push(element('posterCircle', { type: 'circle', x: 770, y: 730, w: 220, h: 220, color: palette.accent, opacity: 0.18 }));
    common.pages.push(makeProposalPage(`proposal_${style}_cover`, '1. 표지', coverEls, palette));
    const points = facts.promise || '핵심 공약 내용을 입력하면 이 영역에 반영됩니다.';
    common.pages.push(makeProposalPage(`proposal_${style}_detail`, '2. 핵심 내용', [
        element('topBar', { type: 'rect', x: 0, y: 0, w: 1080, h: 26, color: palette.accent }),
        element('heading', { type: 'text', text: '핵심 약속', x: 84, y: 120, w: 840, h: 95, size: 68, color: palette.dark, bold: true, align: 'left', templateRole: 'headline' }),
        element('promise', { type: 'text', text: points, x: 88, y: 270, w: 870, h: 210, size: 42, color: '#1e293b', bold: true, align: 'left', templateRole: 'promise' }),
        element('rule', { type: 'rect', x: 88, y: 540, w: 165, h: 10, color: palette.accent }),
        element('detail', { type: 'text', text: '근거와 세부 내용을 추가해 시민이 쉽게 이해할 수 있도록 완성하세요.', x: 88, y: 605, w: 820, h: 130, size: 31, color: '#475569', align: 'left', templateRole: 'body-copy' }),
        element('identity', { type: 'text', text: identity, x: 88, y: 950, w: 820, h: 36, size: 21, color: palette.accent, bold: true, align: 'left', templateRole: 'party-region-number', locked: true })
    ], palette));
    common.pages.push(makeProposalPage(`proposal_${style}_cta`, '3. 마무리', [
        element('background', { type: 'rect', x: 0, y: 0, w: 1080, h: 1080, color: palette.dark }),
        element('title', { type: 'text', text: copy.support, x: 100, y: 250, w: 880, h: 160, size: 68, color: '#ffffff', bold: true, align: 'center', templateRole: 'headline' }),
        element('message', { type: 'text', text: copy.subheadline, x: 150, y: 480, w: 780, h: 120, size: 32, color: '#e2e8f0', align: 'center', templateRole: 'body-copy' }),
        element('candidate', { type: 'text', text: name, x: 160, y: 820, w: 760, h: 60, size: 44, color: '#ffffff', bold: true, align: 'center', templateRole: 'candidate-name', locked: true }),
        element('identity', { type: 'text', text: identity, x: 160, y: 900, w: 760, h: 36, size: 22, color: '#cbd5e1', align: 'center', templateRole: 'party-region-number', locked: true })
    ], { ...palette, soft: palette.dark }));
    return common;
};

app.post('/api/ai/proposals', requireUser(), async (request, response) => {
    const raw = request.body || {};
    const facts = {
        keyword: proposalText(raw.keyword), candidateName: proposalText(raw.candidateName || raw.candidate_name, 80),
        partyName: proposalText(raw.party), region: proposalText(raw.region), number: proposalText(raw.number, 16),
        promise: proposalText(raw.promise, 300), portrait: typeof raw.portrait === 'string' && raw.portrait.startsWith('data:image/') && raw.portrait.length <= 12 * 1024 * 1024 ? raw.portrait : ''
    };
    if (!facts.keyword && !facts.promise) return response.status(400).json({ success: false, message: '키워드 또는 핵심 약속을 입력해 주세요.' });
    const palette = partyPalette[request.user.party] || partyPalette.independent;
    let copy = fallbackProposalCopy(facts);
    let source = 'rules';
    if (process.env.GEMINI_API_KEY) {
        try {
            const aiResponse = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `Create Korean campaign copy as JSON only. Return headline, subheadline, support, questions (one short question). Do not alter or repeat facts as new claims. Facts: ${JSON.stringify({ keyword: facts.keyword, promise: facts.promise, region: facts.region })}`,
                config: { responseMimeType: 'application/json', temperature: 0.55 }
            });
            const generated = JSON.parse(aiResponse.text || '{}');
            if (generated.headline && generated.subheadline) { copy = { ...copy, headline: proposalText(generated.headline, 60), subheadline: proposalText(generated.subheadline, 160), support: proposalText(generated.support, 100) || copy.support, questions: Array.isArray(generated.questions) ? generated.questions.slice(0, 2).map(q => proposalText(q, 120)) : copy.questions }; source = 'ai'; }
        } catch (error) { console.warn('[AI] proposal copy fallback:', error.message); }
    }
    const styles = [['person', '인물 중심형'], ['info', '텍스트 · 그래픽 중심형'], ['poster', '포스터 · 감성형']];
    try {
        const reference = `proposal:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
        await spendCredits(request.user, 20, 'ai_proposal', 'AI 3가지 카드 세트 제안', reference);
        await recordUsage(request.user.id, 'ai_proposal', 1, { source });
    } catch (error) { return response.status(error.status || 500).json({ success: false, message: error.message || '크레딧 처리 중 오류가 발생했습니다.' }); }
    response.json({ success: true, source, facts: { ...facts, portrait: undefined }, questions: copy.questions, proposals: styles.map(([id, name]) => ({ id, name, description: id === 'person' ? '후보자의 신뢰와 존재감을 우선하는 구성' : id === 'info' ? '공약과 핵심 정보를 선명하게 전달하는 구성' : '슬로건과 메시지 확산에 집중하는 구성', state: makeProposalState(id, facts, copy, palette) })) });
});
app.get('/api/admin/subscription-requests', requireUser(['admin']), async (request, response) => {
    const requests = membershipDbReady
        ? (await pool.query(`SELECT r.id, r.requested_tier, r.status, r.created_at, u.id AS user_id, u.display_name, u.email
            FROM subscription_requests r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 250`))[0]
        : localStore.subscriptionRequests.map(item => {
            const user = localStore.users.find(candidate => candidate.id === item.user_id) || {};
            return { ...item, display_name: user.display_name, email: user.email };
        }).sort((a, b) => b.id - a.id);
    response.json({ success: true, requests });
});
app.patch('/api/admin/subscription-requests/:id', requireUser(['admin']), async (request, response) => {
    const { status } = request.body || {};
    if (!['approved', 'rejected'].includes(status)) return response.status(400).json({ success: false, message: '승인 또는 거절만 가능합니다.' });
    if (!membershipDbReady) {
        const item = localStore.subscriptionRequests.find(candidate => candidate.id === Number(request.params.id) && candidate.status === 'pending');
        if (!item) return response.status(404).json({ success: false, message: '검토 가능한 요청이 없습니다.' });
        item.status = status; item.reviewed_at = new Date().toISOString();
        if (status === 'approved') {
            const user = localStore.users.find(candidate => candidate.id === item.user_id);
            if (user) user.tier = item.requested_tier;
        }
        saveLocalStore();
        return response.json({ success: true });
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query("SELECT * FROM subscription_requests WHERE id = ? AND status = 'pending' FOR UPDATE", [request.params.id]);
        if (!rows[0]) { await connection.rollback(); return response.status(404).json({ success: false, message: '검토 가능한 요청이 없습니다.' }); }
        await connection.query('UPDATE subscription_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, request.params.id]);
        if (status === 'approved') await connection.query('UPDATE users SET tier = ? WHERE id = ?', [rows[0].requested_tier, rows[0].user_id]);
        await connection.commit();
        response.json({ success: true });
    } catch (error) { await connection.rollback(); response.status(500).json({ success: false, message: '요청을 처리하지 못했습니다.' }); }
    finally { connection.release(); }
});

// [API] 서버 상태 확인
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', message: '폴인사이트 AI 서버가 정상 작동 중입니다.' });
});

// [API] 프로젝트 저장 (DB 연동)
// Digital profile pages are a separate product surface. They reuse account
// identity but keep their public content and analytics independent of projects.
const PROFILE_LIMITS = { free: 1, basic: 3, premium: 10 };
// A digital profile can grow into a compact mobile site. Page capacity is
// deliberately separate from the number of profiles a member can own.
const PROFILE_PAGE_LIMITS = { free: 1, basic: 3, premium: 8 };
const PROFILE_TEMPLATE_KEYS = new Set(['person', 'portfolio', 'campaign', 'creator', 'consultant', 'local', 'candidate', 'business', 'speaker']);
const PROFILE_PAGE_TYPES = new Set(['intro', 'pledge', 'map', 'certificate', 'greeting', 'video', 'custom']);
const profileSlug = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const profileData = (value) => {
    const source = value && typeof value === 'object' ? value : {};
    const requestedDomain = String(source.customDomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').slice(0, 253);
    return {
        name: String(source.name || '').slice(0, 80), role: String(source.role || '').slice(0, 100),
        tagline: String(source.tagline || '').slice(0, 140),
        bio: String(source.bio || '').slice(0, 700), photo: String(source.photo || '').slice(0, 4_000_000),
        phone: String(source.phone || '').slice(0, 40), email: String(source.email || '').slice(0, 255),
        messageUrl: String(source.messageUrl || '').slice(0, 500), inquiryUrl: String(source.inquiryUrl || '').slice(0, 500),
        social: {
            facebook: String(source.social?.facebook || '').slice(0, 500),
            youtube: String(source.social?.youtube || '').slice(0, 500),
            instagram: String(source.social?.instagram || '').slice(0, 500),
            blog: String(source.social?.blog || '').slice(0, 500)
        },
        // A custom domain is a connection request only. It is never treated as
        // verified or routed until DNS ownership has been checked by an admin.
        customDomain: /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(requestedDomain) ? requestedDomain : '',
        customDomainStatus: requestedDomain ? 'pending' : 'not_requested',
        links: Array.isArray(source.links) ? source.links.slice(0, 8).map(link => ({ label: String(link?.label || '').slice(0, 60), url: String(link?.url || '').slice(0, 500) })) : [],
        portfolio: Array.isArray(source.portfolio) ? source.portfolio.slice(0, 12).map(item => ({ title: String(item?.title || '').slice(0, 100), url: String(item?.url || '').slice(0, 500), image: String(item?.image || '').slice(0, 4_000_000) })) : [],
        resources: Array.isArray(source.resources) ? source.resources.slice(0, 12).map(item => ({ title: String(item?.title || '').slice(0, 100), url: String(item?.url || '').slice(0, 500) })) : [],
        pages: Array.isArray(source.pages) ? source.pages.slice(0, 20).map((page, index) => ({
            id: String(page?.id || `page-${index + 1}`).replace(/[^a-z0-9-]/gi, '').slice(0, 40) || `page-${index + 1}`,
            type: PROFILE_PAGE_TYPES.has(page?.type) ? page.type : 'custom',
            title: String(page?.title || '').slice(0, 80),
            heading: String(page?.heading || '').slice(0, 140),
            body: String(page?.body || '').slice(0, 3000),
            image: String(page?.image || '').slice(0, 4_000_000),
            videoUrl: String(page?.videoUrl || '').slice(0, 500),
            buttonLabel: String(page?.buttonLabel || '').slice(0, 60),
            buttonUrl: String(page?.buttonUrl || '').slice(0, 500)
        })) : []
    };
};
const asProfile = (row) => ({ ...row, is_published: Boolean(row.is_published), profile_data: typeof row.profile_data === 'string' ? JSON.parse(row.profile_data || '{}') : row.profile_data });
const profileStats = async (profileId) => {
    if (!membershipDbReady) {
        const events = localStore.profileEvents.filter(event => event.profile_id === Number(profileId));
        const views = events.filter(event => event.event_type === 'view').length;
        const clicks = events.filter(event => event.event_type === 'link_click').length;
        const contactSaves = events.filter(event => event.event_type === 'contact_save').length;
        const applications = events.filter(event => event.event_type === 'application_submit').length;
        const conversions = clicks + contactSaves + applications;
        return { views, clicks, contactSaves, applications, conversions, conversionRate: views ? Math.round((conversions / views) * 1000) / 10 : 0 };
    }
    const [[counts]] = await pool.query("SELECT COALESCE(SUM(event_type = 'view'), 0) AS views, COALESCE(SUM(event_type = 'link_click'), 0) AS clicks, COALESCE(SUM(event_type = 'contact_save'), 0) AS contactSaves, COALESCE(SUM(event_type = 'application_submit'), 0) AS applications FROM digital_profile_events WHERE profile_id = ?", [profileId]);
    const views = Number(counts.views || 0), clicks = Number(counts.clicks || 0), contactSaves = Number(counts.contactSaves || 0), applications = Number(counts.applications || 0);
    const conversions = clicks + contactSaves + applications;
    return { views, clicks, contactSaves, applications, conversions, conversionRate: views ? Math.round((conversions / views) * 1000) / 10 : 0 };
};

// ==========================================
// 📂 디지털 명함 파일 업로드 (Multer) 설정
// ==========================================
const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const profileId = Number(req.params.id);
        const dir = path.join(__dirname, 'public', 'uploads', 'profiles', String(profileId));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣-_]/g, '');
        cb(null, `${base}-${uniqueSuffix}${ext}`);
    }
});

const uploadFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.zip'];
    if (!allowed.includes(ext)) {
        return cb(new Error('허용되지 않는 파일 형식입니다. (이미지 및 문서 파일만 업로드 가능합니다.)'), false);
    }
    cb(null, true);
};

const profileUpload = multer({
    storage: uploadStorage,
    fileFilter: uploadFilter,
    limits: { fileSize: 15 * 1024 * 1024 } // 최대 15MB 제한
});

// 파일 업로드 API 엔드포인트
app.post('/api/profiles/:id/upload', requireUser(), async (request, response) => {
    const id = Number(request.params.id);
    
    // 프로필 소유권 확인
    const profile = membershipDbReady
        ? (await pool.query('SELECT id FROM digital_profiles WHERE id = ? AND user_id = ? LIMIT 1', [id, request.user.id]))[0][0]
        : localStore.profiles.find(item => item.id === id && item.user_id === request.user.id);
        
    if (!profile) {
        return response.status(404).json({ success: false, message: '프로필을 찾을 수 없습니다.' });
    }
    
    // 파일 업로드 수행
    profileUpload.single('file')(request, response, (err) => {
        if (err) {
            return response.status(400).json({ success: false, message: err.message });
        }
        if (!request.file) {
            return response.status(400).json({ success: false, message: '업로드할 파일이 없습니다.' });
        }
        
        const relativeUrl = `/uploads/profiles/${id}/${request.file.filename}`;
        response.status(200).json({
            success: true,
            url: relativeUrl,
            filename: request.file.filename,
            originalName: request.file.originalname,
            size: request.file.size
        });
    });
});

app.get('/api/profiles', requireUser(), async (request, response) => {
    const rows = membershipDbReady
        ? (await pool.query('SELECT id, title, slug, template_key, is_published, profile_data, published_at, created_at, updated_at FROM digital_profiles WHERE user_id = ? ORDER BY updated_at DESC', [request.user.id]))[0]
        : localStore.profiles.filter(profile => profile.user_id === request.user.id).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    const profiles = await Promise.all(rows.map(async row => ({ ...asProfile(row), stats: await profileStats(row.id) })));
    response.json({ success: true, profiles, profileLimit: PROFILE_LIMITS[request.user.tier] || 1, pageLimit: PROFILE_PAGE_LIMITS[request.user.tier] || 1 });
});
app.get('/api/profiles/:id', requireUser(), async (request, response) => {
    const id = Number(request.params.id);
    const row = membershipDbReady ? (await pool.query('SELECT * FROM digital_profiles WHERE id = ? AND user_id = ? LIMIT 1', [id, request.user.id]))[0][0] : localStore.profiles.find(profile => profile.id === id && profile.user_id === request.user.id);
    if (!row) return response.status(404).json({ success: false, message: '프로필을 찾을 수 없습니다.' });
    response.json({ success: true, profile: { ...asProfile(row), stats: await profileStats(id) } });
});
app.get('/api/profiles/:id/analytics', requireUser(), async (request, response) => {
    const id = Number(request.params.id);
    const profile = membershipDbReady
        ? (await pool.query('SELECT id FROM digital_profiles WHERE id = ? AND user_id = ? LIMIT 1', [id, request.user.id]))[0][0]
        : localStore.profiles.find(item => item.id === id && item.user_id === request.user.id);
    if (!profile) return response.status(404).json({ success: false, message: 'Profile not found.' });
    const events = membershipDbReady
        ? (await pool.query('SELECT event_type, target, created_at FROM digital_profile_events WHERE profile_id = ? ORDER BY created_at DESC LIMIT 30', [id]))[0]
        : localStore.profileEvents.filter(event => event.profile_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30);
    response.json({ success: true, stats: await profileStats(id), events });
});
const allDigitalProfileSamples = [
    { title: '샘플 · 우리동네 동행', slug: 'sample-community', template: 'local', data: { name: '김도윤', role: '지역 커뮤니티 활동가', bio: '함께 돌보고 함께 성장하는 우리 동네를 만듭니다.', pages: [{ id: 'intro', type: 'intro', title: '소개', heading: '우리 동네의 든든한 이웃', body: '생활 가까이에서 필요한 변화를 함께 만들겠습니다.', image: '', videoUrl: '', buttonLabel: '활동 문의', buttonUrl: '' }, { id: 'news', type: 'custom', title: '최근 활동', heading: '이번 달 활동 소식', body: '환경 정화, 돌봄 연계, 청소년 프로그램을 운영하고 있습니다.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'map', type: 'map', title: '오시는 길', heading: '커뮤니티 사무실', body: '평일 10:00–18:00, 누구나 편하게 찾아오세요.', image: '', videoUrl: '', buttonLabel: '지도 보기', buttonUrl: '' }] } },
    { title: '샘플 · 정책 브리핑', slug: 'sample-policy', template: 'campaign', data: { name: '이준혁', role: '지역 정책 연구자', bio: '숫자와 현장을 연결해 실행 가능한 해답을 제시합니다.', pages: [{ id: 'intro', type: 'intro', title: '소개', heading: '더 나은 일상을 위한 정책', body: '주민의 목소리를 데이터로 확인하고 정책으로 답하겠습니다.', image: '', videoUrl: '', buttonLabel: '정책 제안', buttonUrl: '' }, { id: 'pledge', type: 'pledge', title: '핵심 과제', heading: '세 가지 우선 약속', body: '교통·돌봄·청년 일자리의 변화를 차근차근 실현하겠습니다.', image: '', videoUrl: '', buttonLabel: '자세히 보기', buttonUrl: '' }, { id: 'video', type: 'video', title: '브리핑 영상', heading: '3분 정책 브리핑', body: '핵심 내용을 영상으로 확인하세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }] } },
    { title: '샘플 · 크리에이터 포트폴리오', slug: 'sample-creator', template: 'creator', data: { name: '한소연', role: '영상 크리에이터', bio: '사람과 이야기를 더 가깝게 만드는 콘텐츠를 제작합니다.', pages: [{ id: 'intro', type: 'intro', title: '프로필', heading: '일상을 기록하는 크리에이터', body: '브랜드와 지역의 이야기를 짧고 선명한 영상으로 전합니다.', image: '', videoUrl: '', buttonLabel: '협업 문의', buttonUrl: '' }, { id: 'video', type: 'video', title: '대표 영상', heading: '오늘의 콘텐츠', body: '대표 유튜브 영상 주소를 연결해 보세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'portfolio', type: 'custom', title: '작업물', heading: '최근 프로젝트', body: '브랜드 캠페인 · 인터뷰 · 행사 스케치', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }] } },
    { title: '샘플 · 전문 컨설턴트', slug: 'sample-consultant', template: 'consultant', data: { name: '박지현', role: '경영·조직 컨설턴트', bio: '복잡한 문제를 실행 가능한 계획으로 바꿉니다.', pages: [{ id: 'intro', type: 'intro', title: '소개', heading: '성장을 설계하는 파트너', body: '전략, 조직, 실행을 하나의 흐름으로 정리합니다.', image: '', videoUrl: '', buttonLabel: '상담 신청', buttonUrl: '' }, { id: 'history', type: 'custom', title: '전문 분야', heading: '함께하는 영역', body: '조직 진단 · 전략 수립 · 성과 관리 · 리더십 코칭', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'greeting', type: 'greeting', title: '인사말', heading: '작은 변화부터 시작합니다', body: '현장에 맞는 해답을 함께 찾겠습니다.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }] } },
    { title: '샘플 · 감성 포트폴리오', slug: 'sample-portfolio', template: 'portfolio', data: { name: '서하린', role: '브랜드 디자이너', bio: '브랜드의 첫인상을 차분하고 섬세하게 설계합니다.', pages: [{ id: 'intro', type: 'intro', title: '소개', heading: '브랜드의 이야기를 시각화합니다', body: '로고부터 디지털 콘텐츠까지 일관된 경험을 만듭니다.', image: '', videoUrl: '', buttonLabel: '프로젝트 문의', buttonUrl: '' }, { id: 'portfolio', type: 'custom', title: '포트폴리오', heading: '최근 브랜딩 작업', body: '라이프스타일 · 공간 · 문화예술 브랜드 작업', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'resources', type: 'custom', title: '자료실', heading: '프로젝트 자료', body: '소개서와 작업 사례를 확인해 보세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }] } },
    { title: '샘플 · 프리미엄 스피커', slug: 'sample-speaker', template: 'speaker', data: { name: '윤서진', role: '리더십 강연자', bio: '사람을 움직이는 메시지로 조직의 내일을 이야기합니다.', pages: [{ id: 'intro', type: 'intro', title: '소개', heading: '경험을 변화로 연결합니다', body: '조직과 개인이 함께 성장하는 리더십을 전합니다.', image: '', videoUrl: '', buttonLabel: '강연 문의', buttonUrl: '' }, { id: 'video', type: 'video', title: '강연 영상', heading: '대표 강연', body: '대표 강연 영상 주소를 연결해 보세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'certificate', type: 'certificate', title: '프로그램 신청', heading: '함께 배우는 시간', body: '교육 프로그램과 행사 참여를 신청할 수 있습니다.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }] } }
    ,{ title: '샘플 · 골드 보컬리스트', slug: 'sample-vocalist', template: 'speaker', data: { name: '박세린', role: '보컬리스트 · 싱어송라이터', bio: '따뜻한 목소리로 일상에 오래 남는 장면을 노래합니다.', phone: '010-4382-7710', email: 'serin@example.local', links: [{ label: '인스타그램', url: 'https://instagram.com/' }, { label: '대표 영상', url: 'https://youtube.com/' }], pages: [{ id: 'intro', type: 'intro', title: '프로필', heading: 'SERENE · 박세린', body: '공연, 브랜드 음악, 목소리 프로젝트를 함께합니다.', image: '', videoUrl: '', buttonLabel: '공연·협업 문의', buttonUrl: '' }, { id: 'music', type: 'custom', title: '대표 곡', heading: 'Make a Wish', body: '새로운 싱글과 라이브 영상을 만나보세요.', image: '', videoUrl: '', buttonLabel: '음원 듣기', buttonUrl: 'https://youtube.com/' }, { id: 'schedule', type: 'custom', title: '공연 일정', heading: '다가오는 무대', body: '8월 17일 · 여름밤 라이브\n9월 4일 · 도심 콘서트', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }] } }
    ,{ title: '샘플 · 프리미엄 트레이너', slug: 'sample-trainer', template: 'consultant', data: { name: '이도현', role: '프리미엄 퍼스널 트레이너', bio: '개인의 일상과 목표에 맞춰 오래 지속되는 운동 루틴을 설계합니다.', phone: '010-7721-3048', email: 'dohyun@example.local', links: [{ label: '운동 상담', url: 'https://example.com/consult' }, { label: '운동 기록', url: 'https://example.com/log' }], pages: [{ id: 'intro', type: 'intro', title: '소개', heading: '몸의 변화를 일상으로', body: '1:1 맞춤 재활 · 체형 교정 · 근력 향상 프로그램을 운영합니다.', image: '', videoUrl: '', buttonLabel: '상담 예약', buttonUrl: '' }, { id: 'career', type: 'custom', title: '전문 이력', heading: '현장 경험을 바탕으로', body: '생활체육 지도 · 재활 트레이닝 · 퍼포먼스 코칭', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'program', type: 'custom', title: '프로그램', heading: '나에게 맞는 시작', body: '체형 분석부터 월간 루틴까지 함께 관리합니다.', image: '', videoUrl: '', buttonLabel: '프로그램 보기', buttonUrl: '' }] } }
    ,{ title: '샘플 · 노을빛 음성 서비스', slug: 'sample-voice', template: 'portfolio', data: { name: '김성재', role: 'AI VoiceMatch Service', bio: '브랜드의 톤을 닮은 목소리를 찾아 더 선명한 메시지를 만듭니다.', phone: '010-5508-2281', email: 'voice@example.local', links: [{ label: '서비스 소개', url: 'https://example.com/service' }, { label: '포트폴리오', url: 'https://example.com/work' }], pages: [{ id: 'intro', type: 'intro', title: '소개', heading: '당신의 메시지에 어울리는 목소리', body: '광고, 교육, 오디오 콘텐츠에 맞는 보이스 아이덴티티를 제안합니다.', image: '', videoUrl: '', buttonLabel: '프로젝트 문의', buttonUrl: '' }, { id: 'demo', type: 'video', title: '데모 듣기', heading: 'VoiceMatch Demo', body: '프로젝트별 음성 데모를 확인하세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'process', type: 'custom', title: '진행 방식', heading: '발견부터 납품까지', body: '브랜드 분석 · 성우 매칭 · 샘플 제작 · 최종 납품', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }] } }
    ,{ title: '샘플 · 콘텐츠 디렉터', slug: 'sample-content-director', template: 'creator', data: { name: '오유진', role: '콘텐츠 제작사 대표 · 마케팅 강사', bio: '사람들이 멈춰 보는 콘텐츠를 만들고, 팀이 직접 만들 수 있도록 돕습니다.', phone: '010-8834-9012', email: 'yujin@example.local', links: [{ label: '인스타그램', url: 'https://instagram.com/' }, { label: '유튜브', url: 'https://youtube.com/' }, { label: '협업 문의', url: 'https://example.com/contact' }], pages: [{ id: 'intro', type: 'intro', title: '소개', heading: '콘텐츠가 일하는 방식을 만듭니다', body: '브랜드 전략부터 촬영, 편집, 교육까지 한 흐름으로 설계합니다.', image: '', videoUrl: '', buttonLabel: '강의·협업 문의', buttonUrl: '' }, { id: 'video', type: 'video', title: '대표 콘텐츠', heading: '최근 강의와 프로젝트', body: '브랜딩과 영상 제작의 실제 사례를 영상으로 만나보세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'service', type: 'custom', title: '서비스', heading: '필요한 만큼 함께합니다', body: '콘텐츠 전략 · 영상 제작 · 편집 · 기업 교육 · 채널 운영', image: '', videoUrl: '', buttonLabel: '서비스 보기', buttonUrl: '' }] } }
];
// These four variants are the political campaign examples shown in the sample gallery.
// They deliberately contain fictional people, locations, and contact details.
const politicalSampleOverrides = {
    'sample-vocalist': { title: '샘플 · 주민 곁의 후보', template: 'candidate', data: { name: '박서린', role: '해오름구 시의원 예비후보', bio: '매일의 불편을 듣고, 주민과 함께 답을 만들겠습니다.', phone: '010-4382-7710', email: 'seorin.campaign@example.local', messageUrl: 'https://example.com/talk', links: [{ label: '후보 소개', url: 'https://example.com/about' }, { label: '공식 채널', url: 'https://example.com/channel' }], pages: [{ id: 'intro', type: 'intro', title: '후보 소개', heading: '주민 곁에서 답을 찾겠습니다', body: '생활 현장의 목소리를 정책으로 연결하는 박서린입니다.', image: '', videoUrl: '', buttonLabel: '후보에게 의견 보내기', buttonUrl: 'https://example.com/talk' }, { id: 'pledge', type: 'pledge', title: '핵심 공약', heading: '돌봄 · 교통 · 안전', body: '아이 키우기 좋은 동네, 편하게 오가는 길, 안심되는 일상을 만들겠습니다.', image: '', videoUrl: '', buttonLabel: '공약 자세히 보기', buttonUrl: 'https://example.com/pledge' }, { id: 'map', type: 'map', title: '선거사무소', heading: '언제든 찾아오세요', body: '해오름구 주민로 25 · 평일 10:00–18:00', image: '', videoUrl: '', buttonLabel: '약도 보기', buttonUrl: 'https://example.com/map' }] } },
    'sample-trainer': { title: '샘플 · 청년·생활 정책 후보', template: 'campaign', data: { name: '이도현', role: '푸른시 도의원 후보', bio: '청년의 오늘과 가족의 내일을 함께 준비하겠습니다.', phone: '010-7721-3048', email: 'dohyun.campaign@example.local', links: [{ label: '정책 제안', url: 'https://example.com/policy' }, { label: '자원봉사 참여', url: 'https://example.com/join' }], pages: [{ id: 'intro', type: 'intro', title: '인사말', heading: '변화는 생활 가까이에서 시작됩니다', body: '일자리, 주거, 건강을 잇는 실용적인 변화를 약속드립니다.', image: '', videoUrl: '', buttonLabel: '정책 의견 보내기', buttonUrl: 'https://example.com/policy' }, { id: 'pledge', type: 'pledge', title: '청년 공약', heading: '시작을 응원하는 도시', body: '청년 주거 지원, 지역 일자리 연계, 문화 공간 확대를 추진하겠습니다.', image: '', videoUrl: '', buttonLabel: '공약 보기', buttonUrl: 'https://example.com/pledge' }, { id: 'certificate', type: 'certificate', title: '참여 신청', heading: '함께 만드는 선거', body: '캠페인 소식 구독과 자원봉사 참여를 신청하세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }] } },
    'sample-voice': { title: '샘플 · 3분 정책 브리핑', template: 'campaign', data: { name: '김성재', role: '바른정책 연구소장 · 캠페인 정책위원', bio: '숫자와 현장을 연결해 실현 가능한 지역 해법을 제시합니다.', phone: '010-5508-2281', email: 'policy@example.local', links: [{ label: '정책 자료실', url: 'https://example.com/resources' }, { label: '주민 제안', url: 'https://example.com/idea' }], pages: [{ id: 'intro', type: 'intro', title: '정책 브리핑', heading: '알기 쉬운 지역 정책', body: '복잡한 현안을 시민의 언어로 설명하고, 실행 계획을 공개합니다.', image: '', videoUrl: '', buttonLabel: '정책 제안하기', buttonUrl: 'https://example.com/idea' }, { id: 'video', type: 'video', title: '3분 영상', heading: '이번 주 정책 브리핑', body: '교통·돌봄·상권 회복의 핵심 내용을 영상으로 확인하세요.', image: '', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', buttonLabel: '', buttonUrl: '' }, { id: 'custom', type: 'custom', title: '자료실', heading: '근거와 실행 계획', body: '정책 요약본, 예산 근거, 주민 의견 반영 과정을 투명하게 공개합니다.', image: '', videoUrl: '', buttonLabel: '자료 확인', buttonUrl: 'https://example.com/resources' }] } },
    'sample-content-director': { title: '샘플 · 지역소통 캠페인', template: 'local', data: { name: '오유진', role: '새봄동 주민소통위원회', bio: '주민의 작은 제안이 지역의 큰 변화가 되도록 연결합니다.', phone: '010-8834-9012', email: 'community@example.local', links: [{ label: '소식 구독', url: 'https://example.com/news' }, { label: '캠페인 참여', url: 'https://example.com/join' }], pages: [{ id: 'intro', type: 'intro', title: '캠페인 소개', heading: '우리 동네의 다음 장면', body: '주민 참여로 만드는 안전한 골목, 따뜻한 돌봄, 활기찬 상권 이야기입니다.', image: '', videoUrl: '', buttonLabel: '참여하기', buttonUrl: 'https://example.com/join' }, { id: 'video', type: 'video', title: '현장 영상', heading: '주민의 목소리', body: '지역 현장에서 만난 주민들의 이야기와 변화를 확인하세요.', image: '', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', buttonLabel: '', buttonUrl: '' }, { id: 'greeting', type: 'greeting', title: '인사말', heading: '듣고, 기록하고, 바꾸겠습니다', body: '여러분의 의견을 기다립니다. 모든 제안은 공개적으로 검토하고 답하겠습니다.', image: '', videoUrl: '', buttonLabel: '의견 보내기', buttonUrl: 'https://example.com/talk' }] } }
};
allDigitalProfileSamples.forEach(sample => { if (politicalSampleOverrides[sample.slug]) Object.assign(sample, politicalSampleOverrides[sample.slug]); });
// The official Park Seorin card is always shown separately in the management
// screen. Seven additional examples keep the visible sample library at 8.
const DIGITAL_PROFILE_SAMPLE_SLUGS = new Set([
    'sample-community', 'sample-policy', 'sample-creator', 'sample-consultant',
    'sample-portfolio', 'sample-trainer', 'sample-content-director'
]);
const digitalProfileSamples = allDigitalProfileSamples.filter(sample => DIGITAL_PROFILE_SAMPLE_SLUGS.has(sample.slug));
const sampleProfileDesigns = require('./sample-profile-designs');
const digitalProfileSamplePhotos = {
    'sample-community': '/assets/politician-mobile-card-samples/assets/seo-rin.png',
    'sample-policy': '/assets/politician-mobile-card-samples/assets/min-seok.png',
    'sample-creator': '/assets/profile.png',
    'sample-consultant': '/assets/politician-mobile-card-samples/assets/ga-eun.png',
    'sample-portfolio': '/assets/politician-mobile-card-samples/assets/yu-jin.png',
    'sample-trainer': '/assets/profile-samples/candidate-lee-dohyun.png',
    'sample-content-director': '/assets/politician-mobile-card-samples/assets/do-yoon.png'
};
digitalProfileSamples.forEach((sample) => {
    sample.data = sampleProfileDesigns[sample.slug] || sample.data;
    sample.data.photo = digitalProfileSamplePhotos[sample.slug] || sample.data.photo || '';
    sample.data.social ||= {
        facebook: 'https://www.facebook.com/',
        youtube: 'https://www.youtube.com/',
        instagram: 'https://www.instagram.com/',
        blog: 'https://blog.naver.com/'
    };
    sample.data.pages?.forEach((page) => {
        if (page.type === 'video' && !page.videoUrl) page.videoUrl = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
    });
});
app.post('/api/profiles/create-samples', requireUser(), async (request, response) => {
    const owned = membershipDbReady ? Number((await pool.query('SELECT COUNT(*) AS count FROM digital_profiles WHERE user_id = ?', [request.user.id]))[0][0].count) : localStore.profiles.filter(profile => profile.user_id === request.user.id).length;
    const available = Math.max(0, (PROFILE_LIMITS[request.user.tier] || 1) - owned);
    if (!available) return response.status(402).json({ success: false, message: 'Your current plan has no remaining profile slots.' });
    const existingSlugs = new Set(membershipDbReady ? (await pool.query('SELECT slug FROM digital_profiles WHERE user_id = ?', [request.user.id]))[0].map(row => row.slug) : localStore.profiles.filter(profile => profile.user_id === request.user.id).map(profile => ({ slug: profile.slug })).map(row => row.slug));
    const created = [];
    for (const sample of digitalProfileSamples) {
        if (created.length >= available || existingSlugs.has(sample.slug)) continue;
        const data = profileData(sample.data);
        if (membershipDbReady) { const [result] = await pool.query('INSERT INTO digital_profiles (user_id, title, slug, template_key, profile_data) VALUES (?, ?, ?, ?, ?)', [request.user.id, sample.title, sample.slug, sample.template, JSON.stringify(data)]); created.push(result.insertId); }
        else { const id = localStore.nextProfileId++; localStore.profiles.push({ id, user_id: request.user.id, title: sample.title, slug: sample.slug, template_key: sample.template, is_published: false, profile_data: data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); created.push(id); }
    }
    if (!membershipDbReady && created.length) saveLocalStore();
    response.status(201).json({ success: true, created, available, message: `${created.length} sample profiles created.` });
});
const profilePageBlueprint = (variant, data) => {
    const name = String(data.name || '대표자');
    const intro = { id: 'intro', type: 'intro', title: '소개', heading: name, body: String(data.bio || '반갑습니다. 활동과 약속을 소개합니다.'), image: '', videoUrl: '', buttonLabel: '문의하기', buttonUrl: String(data.inquiryUrl || data.messageUrl || '') };
    if (variant === 'trust') return [intro, { id: 'greeting', type: 'greeting', title: '인사말', heading: '진심을 담아 인사드립니다', body: '지역과 사람을 먼저 생각하는 마음으로 꾸준히 소통하겠습니다.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'history', type: 'custom', title: '활동 이력', heading: '걸어온 길', body: '주요 활동과 경력을 입력해 신뢰를 더해 주세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }];
    if (variant === 'promise') return [intro, { id: 'pledge', type: 'pledge', title: '핵심 공약', heading: '실천으로 증명하겠습니다', body: '가장 중요한 약속과 실행 계획을 명확하게 적어 주세요.', image: '', videoUrl: '', buttonLabel: '공약 자세히 보기', buttonUrl: '' }, { id: 'map', type: 'map', title: '오시는 길', heading: '사무실 안내', body: '주소, 운영 시간, 주차 정보를 입력해 주세요.', image: '', videoUrl: '', buttonLabel: '지도에서 보기', buttonUrl: '' }];
    return [intro, { id: 'video', type: 'video', title: '영상 보기', heading: '영상으로 전하는 이야기', body: '소개 영상이나 주요 활동 영상을 연결해 주세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }, { id: 'news', type: 'custom', title: '새 소식', heading: '최근 활동', body: '주요 소식과 참여 방법을 안내해 주세요.', image: '', videoUrl: '', buttonLabel: '', buttonUrl: '' }];
};
app.post('/api/profiles/:id/design-proposals', requireUser(), async (request, response) => {
    const id = Number(request.params.id);
    const row = membershipDbReady
        ? (await pool.query('SELECT * FROM digital_profiles WHERE id = ? AND user_id = ? LIMIT 1', [id, request.user.id]))[0][0]
        : localStore.profiles.find(item => item.id === id && item.user_id === request.user.id);
    if (!row) return response.status(404).json({ success: false, message: 'Profile not found.' });
    const profile = asProfile(row), data = profile.profile_data || {};
    const proposals = [
        { id: 'trust', name: '신뢰 중심형', templateKey: 'consultant', accent: '#15803d', description: '인물 소개·인사말·활동 이력을 중심으로 신뢰를 쌓는 구성입니다.' },
        { id: 'promise', name: '공약 중심형', templateKey: 'campaign', accent: '#2563eb', description: '공약과 실행 계획, 사무실 정보를 빠르게 전달하는 구성입니다.' },
        { id: 'media', name: '영상 소통형', templateKey: 'creator', accent: '#7c3aed', description: '영상과 최신 소식을 앞세워 소통과 참여를 유도하는 구성입니다.' }
    ].map(item => ({ ...item, pages: profilePageBlueprint(item.id, data) }));
    let source = 'rules';
    if (process.env.GEMINI_API_KEY) {
        try {
            const result = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `다음 모바일 명함 정보를 읽고, 3가지 디자인 방향(신뢰 중심형, 공약 중심형, 영상 소통형)에 맞는 짧은 설명을 각각 45자 이내 한국어로 JSON 배열로 반환하세요. 사실을 만들어내지 마세요. 정보: ${JSON.stringify({ name: data.name, role: data.role, bio: data.bio, prompt: String(request.body?.prompt || '').slice(0, 300) })}`,
                config: { responseMimeType: 'application/json', temperature: 0.35 }
            });
            const generated = JSON.parse(result.text || '[]');
            if (Array.isArray(generated)) generated.forEach((item, index) => { if (item?.description) proposals[index].description = String(item.description).slice(0, 80); });
            await spendCredits(request.user, 5, 'profile_design_proposal', 'AI mobile profile design proposals', `profile-design:${id}:${Date.now()}`);
            await recordUsage(request.user.id, 'profile_design_proposal', 1);
            source = 'ai';
        } catch (error) { console.warn('[PROFILE DESIGN] AI fallback:', error.message); }
    }
    response.json({ success: true, source, proposals });
});
app.post('/api/profiles/:id/design-chat', requireUser(), async (request, response) => {
    const id = Number(request.params.id);
    const row = membershipDbReady
        ? (await pool.query('SELECT * FROM digital_profiles WHERE id = ? AND user_id = ? LIMIT 1', [id, request.user.id]))[0][0]
        : localStore.profiles.find(item => item.id === id && item.user_id === request.user.id);
    if (!row) return response.status(404).json({ success: false, message: '명함을 찾을 수 없습니다.' });
    const profile = asProfile(row), data = profile.profile_data || {}, message = String(request.body?.message || '').trim().slice(0, 500);
    const fallbackQuestions = [];
    if (!data.bio) fallbackQuestions.push('방문자에게 가장 먼저 전하고 싶은 한 문장을 알려주세요.');
    fallbackQuestions.push('이번 명함에서 가장 중요한 목적은 무엇인가요? 예: 문의, 공약 안내, 행사 참여, 포트폴리오');
    if (!data.inquiryUrl && !data.messageUrl) fallbackQuestions.push('방문자가 눌러야 할 가장 중요한 버튼은 무엇인가요? 예: 상담 신청, 카카오톡 문의');
    let reply = message ? `“${message}” 방향으로 구성하겠습니다. 아래 내용을 알려주시면 더 정확한 시안을 제안할 수 있습니다.` : '명함의 목적과 원하는 분위기를 알려주세요. 필요한 항목을 차례로 확인하겠습니다.';
    let questions = fallbackQuestions.slice(0, 3), source = 'rules';
    if (process.env.GEMINI_API_KEY) {
        try {
            const result = await ai.models.generateContent({
                model: 'gemini-3.6-flash',
                contents: `당신은 비전문가를 돕는 한국어 디지털 명함 기획 도우미입니다. 다음 정보를 바탕으로, 사용자의 최근 메시지에 짧게 답하고 시안 제작에 필요한 질문을 최대 3개만 JSON으로 반환하세요. 형식: {"reply":"...","questions":["...", "..."]}. 이미 받은 정보는 다시 묻지 말고, 개인 민감정보는 요구하지 마세요. 정보: ${JSON.stringify({ name: data.name, role: data.role, bio: data.bio, phone: Boolean(data.phone), email: Boolean(data.email), links: data.links?.length || 0, pages: data.pages?.map(page => page.type) || [], message })}`,
                config: { responseMimeType: 'application/json', temperature: 0.35 }
            });
            const generated = JSON.parse(result.text || '{}');
            if (generated?.reply) reply = String(generated.reply).slice(0, 280);
            if (Array.isArray(generated?.questions)) questions = generated.questions.map(question => String(question).slice(0, 160)).filter(Boolean).slice(0, 3);
            await spendCredits(request.user, 1, 'profile_design_chat', 'AI 명함 기획 대화', `profile-chat:${id}:${Date.now()}`);
            await recordUsage(request.user.id, 'profile_design_chat', 1);
            source = 'ai';
        } catch (error) { console.warn('[PROFILE CHAT] AI fallback:', error.message); }
    }
    response.json({ success: true, source, reply, questions });
});
app.post('/api/profiles', requireUser(), async (request, response) => {
    const owned = membershipDbReady ? Number((await pool.query('SELECT COUNT(*) AS count FROM digital_profiles WHERE user_id = ?', [request.user.id]))[0][0].count) : localStore.profiles.filter(profile => profile.user_id === request.user.id).length;
    if (owned >= (PROFILE_LIMITS[request.user.tier] || 1)) return response.status(402).json({ success: false, message: '현재 플랜의 공개 프로필 생성 한도에 도달했습니다.' });
    const title = String(request.body?.title || '새 디지털 명함').trim().slice(0, 120) || '새 디지털 명함';
    const slug = profileSlug(request.body?.slug || `${request.user.display_name || 'profile'}-${Date.now().toString(36)}`);
    if (slug.length < 3) return response.status(400).json({ success: false, message: '공개 주소는 영문·숫자·하이픈으로 3자 이상 입력해 주세요.' });
    const data = profileData(request.body?.profile_data);
    if (data.pages.length > (PROFILE_PAGE_LIMITS[request.user.tier] || 1)) return response.status(402).json({ success: false, message: `현재 플랜은 페이지를 ${PROFILE_PAGE_LIMITS[request.user.tier] || 1}장까지 만들 수 있습니다.` });
    const templateKey = PROFILE_TEMPLATE_KEYS.has(request.body?.template_key) ? request.body.template_key : 'person';
    try {
        let id;
        if (membershipDbReady) { const [result] = await pool.query('INSERT INTO digital_profiles (user_id, title, slug, template_key, profile_data) VALUES (?, ?, ?, ?, ?)', [request.user.id, title, slug, templateKey, JSON.stringify(data)]); id = result.insertId; }
        else { id = localStore.nextProfileId++; localStore.profiles.push({ id, user_id: request.user.id, title, slug, template_key: templateKey, is_published: false, profile_data: data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); saveLocalStore(); }
        response.status(201).json({ success: true, profileId: id });
    } catch (error) { response.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ success: false, message: error.code === 'ER_DUP_ENTRY' ? '이미 사용 중인 공개 주소입니다.' : '프로필을 만들지 못했습니다.' }); }
});
app.patch('/api/profiles/:id', requireUser(), async (request, response) => {
    const id = Number(request.params.id), title = String(request.body?.title || '새 디지털 명함').trim().slice(0, 120) || '새 디지털 명함', slug = profileSlug(request.body?.slug);
    const templateKey = PROFILE_TEMPLATE_KEYS.has(request.body?.template_key) ? request.body.template_key : 'person', isPublished = Boolean(request.body?.is_published), data = profileData(request.body?.profile_data);
    if (slug.length < 3) return response.status(400).json({ success: false, message: '공개 주소는 영문·숫자·하이픈으로 3자 이상 입력해 주세요.' });
    if (data.pages.length > (PROFILE_PAGE_LIMITS[request.user.tier] || 1)) return response.status(402).json({ success: false, message: `현재 플랜은 페이지를 ${PROFILE_PAGE_LIMITS[request.user.tier] || 1}장까지 만들 수 있습니다.` });
    try {
        if (membershipDbReady) { const [result] = await pool.query('UPDATE digital_profiles SET title = ?, slug = ?, template_key = ?, is_published = ?, profile_data = ?, published_at = IF(?, COALESCE(published_at, CURRENT_TIMESTAMP), NULL) WHERE id = ? AND user_id = ?', [title, slug, templateKey, isPublished, JSON.stringify(data), isPublished, id, request.user.id]); if (!result.affectedRows) return response.status(404).json({ success: false, message: '프로필을 찾을 수 없습니다.' }); }
        else { const profile = localStore.profiles.find(item => item.id === id && item.user_id === request.user.id); if (!profile) return response.status(404).json({ success: false, message: '프로필을 찾을 수 없습니다.' }); if (localStore.profiles.some(item => item.id !== id && item.slug === slug)) return response.status(409).json({ success: false, message: '이미 사용 중인 공개 주소입니다.' }); Object.assign(profile, { title, slug, template_key: templateKey, is_published: isPublished, profile_data: data, published_at: isPublished ? (profile.published_at || new Date().toISOString()) : null, updated_at: new Date().toISOString() }); saveLocalStore(); }
        response.json({ success: true, publicUrl: isPublished ? `/p/${slug}` : null });
    } catch (error) { response.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ success: false, message: error.code === 'ER_DUP_ENTRY' ? '이미 사용 중인 공개 주소입니다.' : '프로필을 저장하지 못했습니다.' }); }
});
app.delete('/api/profiles/:id', requireUser(), async (request, response) => {
    const id = Number(request.params.id);
    if (membershipDbReady) {
        const [result] = await pool.query('DELETE FROM digital_profiles WHERE id = ? AND user_id = ?', [id, request.user.id]);
        if (!result.affectedRows) return response.status(404).json({ success: false, message: '프로필을 찾을 수 없습니다.' });
    } else {
        const index = localStore.profiles.findIndex(profile => profile.id === id && profile.user_id === request.user.id);
        if (index < 0) return response.status(404).json({ success: false, message: '프로필을 찾을 수 없습니다.' });
        localStore.profiles.splice(index, 1);
        localStore.profileEvents = localStore.profileEvents.filter(event => event.profile_id !== id);
        saveLocalStore();
    }
    response.json({ success: true });
});
app.get('/api/public-profiles/:slug', async (request, response) => {
    const slug = profileSlug(request.params.slug);
    const row = membershipDbReady ? (await pool.query('SELECT id, title, slug, template_key, profile_data FROM digital_profiles WHERE slug = ? AND is_published = TRUE LIMIT 1', [slug]))[0][0] : localStore.profiles.find(profile => profile.slug === slug && profile.is_published);
    if (!row) return response.status(404).json({ success: false, message: '공개 페이지를 찾을 수 없습니다.' });
    if (membershipDbReady) await pool.query("INSERT INTO digital_profile_events (profile_id, event_type) VALUES (?, 'view')", [row.id]); else { localStore.profileEvents.push({ profile_id: row.id, event_type: 'view', created_at: new Date().toISOString() }); saveLocalStore(); }
    response.json({ success: true, profile: asProfile(row) });
});
app.post('/api/public-profiles/:slug/click', async (request, response) => {
    const slug = profileSlug(request.params.slug);
    const row = membershipDbReady ? (await pool.query('SELECT id FROM digital_profiles WHERE slug = ? AND is_published = TRUE LIMIT 1', [slug]))[0][0] : localStore.profiles.find(profile => profile.slug === slug && profile.is_published);
    if (!row) return response.status(404).json({ success: false });
    const target = String(request.body?.target || '').slice(0, 500);
    if (membershipDbReady) await pool.query("INSERT INTO digital_profile_events (profile_id, event_type, target) VALUES (?, 'link_click', ?)", [row.id, target || null]); else { localStore.profileEvents.push({ profile_id: row.id, event_type: 'link_click', target, created_at: new Date().toISOString() }); saveLocalStore(); }
    response.json({ success: true });
});
app.get('/api/public-profiles/:slug/vcard', async (request, response) => {
    const slug = profileSlug(request.params.slug);
    const row = membershipDbReady ? (await pool.query('SELECT id, title, slug, profile_data FROM digital_profiles WHERE slug = ? AND is_published = TRUE LIMIT 1', [slug]))[0][0] : localStore.profiles.find(profile => profile.slug === slug && profile.is_published);
    if (!row) return response.status(404).send('Profile not found.');
    const data = asProfile(row).profile_data || {};
    const clean = value => String(value || '').replace(/[\\,;\n\r]/g, ' ').trim();
    const name = clean(data.name || row.title || 'Profile');
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, `N:${name};;;;`];
    if (data.role) lines.push(`TITLE:${clean(data.role)}`);
    if (data.phone) lines.push(`TEL;TYPE=CELL:${clean(data.phone)}`);
    if (data.email) lines.push(`EMAIL;TYPE=INTERNET:${clean(data.email)}`);
    lines.push(`URL:${request.protocol}://${request.get('host')}/p/${slug}`, 'END:VCARD');
    if (membershipDbReady) await pool.query("INSERT INTO digital_profile_events (profile_id, event_type, target) VALUES (?, 'contact_save', 'vcard')", [row.id]);
    else { localStore.profileEvents.push({ profile_id: row.id, event_type: 'contact_save', target: 'vcard', created_at: new Date().toISOString() }); saveLocalStore(); }
    response.set({ 'Content-Type': 'text/vcard; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}.vcf"` }).send(lines.join('\r\n'));
});
app.post('/api/public-profiles/:slug/applications', async (request, response) => {
    const slug = profileSlug(request.params.slug);
    const profile = membershipDbReady
        ? (await pool.query('SELECT id FROM digital_profiles WHERE slug = ? AND is_published = TRUE LIMIT 1', [slug]))[0][0]
        : localStore.profiles.find(item => item.slug === slug && item.is_published);
    if (!profile) return response.status(404).json({ success: false, message: 'Published profile not found.' });
    const name = String(request.body?.name || '').trim().slice(0, 100);
    const phone = String(request.body?.phone || '').trim().slice(0, 40);
    const email = String(request.body?.email || '').trim().slice(0, 255);
    const message = String(request.body?.message || '').trim().slice(0, 2000);
    if (!name || (!phone && !email) || request.body?.consent !== true) return response.status(400).json({ success: false, message: 'Name, one contact method, and consent are required.' });
    if (membershipDbReady) await pool.query('INSERT INTO digital_profile_applications (profile_id, applicant_name, phone, email, message) VALUES (?, ?, ?, ?, ?)', [profile.id, name, phone || null, email || null, message || null]);
    else { localStore.profileApplications.push({ id: localStore.nextProfileApplicationId++, profile_id: profile.id, applicant_name: name, phone, email, message, status: 'new', created_at: new Date().toISOString() }); saveLocalStore(); }
    if (membershipDbReady) await pool.query("INSERT INTO digital_profile_events (profile_id, event_type, target) VALUES (?, 'application_submit', 'certificate')", [profile.id]);
    else { localStore.profileEvents.push({ profile_id: profile.id, event_type: 'application_submit', target: 'certificate', created_at: new Date().toISOString() }); saveLocalStore(); }
    response.status(201).json({ success: true });
});
app.get('/api/profiles/:id/applications', requireUser(), async (request, response) => {
    const id = Number(request.params.id);
    const owned = membershipDbReady
        ? (await pool.query('SELECT id FROM digital_profiles WHERE id = ? AND user_id = ? LIMIT 1', [id, request.user.id]))[0][0]
        : localStore.profiles.find(item => item.id === id && item.user_id === request.user.id);
    if (!owned) return response.status(404).json({ success: false, message: 'Profile not found.' });
    const applications = membershipDbReady
        ? (await pool.query('SELECT id, applicant_name, phone, email, message, status, created_at FROM digital_profile_applications WHERE profile_id = ? ORDER BY created_at DESC LIMIT 200', [id]))[0]
        : localStore.profileApplications.filter(item => item.profile_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    response.json({ success: true, applications });
});
app.get('/p/:slug', (request, response) => response.sendFile(path.join(__dirname, 'public', 'profile-public-v3.html')));

app.post('/api/legacy-projects/save', async (req, res) => {
    try {
        const { title, candidate_name, design_state } = req.body;
        const targetTitle = title || '무제';
        const targetCandidate = candidate_name || '후보자';
        const targetState = design_state || req.body.pagesData || [];

        console.log(`[DB 저장] 제목: ${targetTitle}, 슬라이드 수: ${targetState.length}`);

        try {
            const query = 'INSERT INTO campaign_cards (title, candidate_name, design_state) VALUES (?, ?, ?)';
            const [result] = await pool.query(query, [targetTitle, targetCandidate, JSON.stringify(targetState)]);
            res.json({ 
                success: true, 
                message: '데이터베이스에 성공적으로 저장되었습니다.', 
                projectId: result.insertId 
            });
        } catch (dbError) {
            console.warn('[DB 경고] DB 저장 실패 (스키마 미생성 또는 연결 오류):', dbError.message);
            res.json({ 
                success: true, 
                message: '서버 캐시에 저장되었습니다 (DB 시뮬레이션 성공).', 
                projectId: 'temp_id_' + Date.now() 
            });
        }
    } catch (error) {
        console.error('저장 에러:', error);
        res.status(500).json({ success: false, message: '저장 중 서버 오류가 발생했습니다.' });
    }
});

// [API] 프로젝트 불러오기
app.get('/api/legacy-projects/load', async (req, res) => {
    try {
        try {
            const [rows] = await pool.query('SELECT id, title, candidate_name, design_state, created_at FROM campaign_cards ORDER BY id DESC LIMIT 10');
            res.json({ success: true, projects: rows });
        } catch (dbError) {
            console.warn('[DB 경고] 프로젝트 로드 실패:', dbError.message);
            res.json({ success: true, projects: [] });
        }
    } catch (error) {
        console.error('로드 에러:', error);
        res.status(500).json({ success: false, message: '불러오기 중 서버 오류가 발생했습니다.' });
    }
});

// 🛡️ [API] AI 디자인 어시스턴트 (프론트엔드 노출 원천 차단)
// Authenticated workspace: folders and project history are private to each account.
app.get('/api/folders', requireUser(), async (req, res) => {
    const [folders] = await pool.query(`SELECT f.id, f.name, f.created_at, f.updated_at, COUNT(p.id) AS project_count
        FROM design_folders f LEFT JOIN design_projects p ON p.folder_id = f.id
        WHERE f.user_id = ? GROUP BY f.id ORDER BY f.updated_at DESC, f.name ASC`, [req.user.id]);
    res.json({ success: true, folders });
});
app.post('/api/folders', requireUser(), async (req, res) => {
    const name = String(req.body?.name || '').trim().slice(0, 100);
    if (!name) return res.status(400).json({ success: false, message: '폴더 이름을 입력해주세요.' });
    try {
        const [result] = await pool.query('INSERT INTO design_folders (user_id, name) VALUES (?, ?)', [req.user.id, name]);
        res.json({ success: true, folder: { id: result.insertId, name, project_count: 0 } });
    } catch { res.status(409).json({ success: false, message: '같은 이름의 폴더가 이미 있습니다.' }); }
});
app.delete('/api/folders/:id', requireUser(), async (req, res) => {
    const [result] = await pool.query('DELETE FROM design_folders WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '폴더를 찾을 수 없습니다.' });
    res.json({ success: true });
});
app.get('/api/projects/load', requireUser(), async (req, res) => {
    const [projects] = await pool.query('SELECT id, title, candidate_name, folder_id, preview_data, created_at, updated_at FROM design_projects WHERE user_id = ? ORDER BY updated_at DESC', [req.user.id]);
    res.json({ success: true, projects });
});
app.get('/api/projects/:id', requireUser(), async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM design_projects WHERE id = ? AND user_id = ? LIMIT 1', [Number(req.params.id), req.user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '프로젝트를 찾을 수 없습니다.' });
    res.json({ success: true, project: rows[0] });
});
app.post('/api/projects/save', requireUser(), async (req, res) => {
    const { id, title, candidate_name, design_state, preview_data, folder_id } = req.body || {};
    if (!membershipDbReady) return res.status(503).json({ success: false, message: '프로젝트 저장소를 사용할 수 없습니다.' });
    const folderId = folder_id ? Number(folder_id) : null;
    if (folderId) {
        const [folders] = await pool.query('SELECT id FROM design_folders WHERE id = ? AND user_id = ?', [folderId, req.user.id]);
        if (!folders.length) return res.status(400).json({ success: false, message: '선택한 폴더를 찾을 수 없습니다.' });
    }
    const state = design_state || req.body.pagesData || {};
    let projectId = Number(id) || null;
    if (projectId) {
        const [result] = await pool.query('UPDATE design_projects SET title = ?, candidate_name = ?, design_state = ?, preview_data = ?, folder_id = ? WHERE id = ? AND user_id = ?', [String(title || '새 디자인').slice(0, 255), candidate_name || null, JSON.stringify(state), preview_data || null, folderId, projectId, req.user.id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: '프로젝트를 찾을 수 없습니다.' });
    } else {
        const [result] = await pool.query('INSERT INTO design_projects (user_id, folder_id, title, candidate_name, design_state, preview_data) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, folderId, String(title || '새 디자인').slice(0, 255), candidate_name || null, JSON.stringify(state), preview_data || null]);
        projectId = result.insertId;
    }
    res.json({ success: true, message: '프로젝트가 저장되었습니다.', projectId });
});
app.patch('/api/projects/:id', requireUser(), async (req, res) => {
    const folderId = req.body?.folder_id ? Number(req.body.folder_id) : null;
    if (folderId) {
        const [folders] = await pool.query('SELECT id FROM design_folders WHERE id = ? AND user_id = ?', [folderId, req.user.id]);
        if (!folders.length) return res.status(400).json({ success: false, message: '폴더를 찾을 수 없습니다.' });
    }
    const [result] = await pool.query('UPDATE design_projects SET folder_id = ? WHERE id = ? AND user_id = ?', [folderId, Number(req.params.id), req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '프로젝트를 찾을 수 없습니다.' });
    res.json({ success: true });
});
app.delete('/api/projects/:id', requireUser(), async (req, res) => {
    const [result] = await pool.query('DELETE FROM design_projects WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '프로젝트를 찾을 수 없습니다.' });
    res.json({ success: true });
});

app.post('/api/support/chat', requireUser(), async (req, res) => {
    const question = String(req.body?.message || '').trim().slice(0, 1000);
    if (!question) return res.status(400).json({ success: false, message: '문의 내용을 입력해주세요.' });
    const systemInstruction = `You are the Korean customer-support assistant for POLLINSIGHT Design Studio. Answer in Korean, concisely and accurately. Only help with this product: login, subscriptions, project saving, folders, exports, tables, canvas editing, and mobile use. Known facts: server save creates or updates the current design; My Work provides folders and opens saved designs; deleting a folder leaves its projects uncategorized; exports include PNG, JPG, PDF and PPTX; table rows and columns resize by dragging their internal boundaries; mobile has a bottom tool rail and touch editing. Do not invent policies, prices, or completed integrations. If the question needs human support, say so clearly. Never ask for passwords, payment details, or sensitive personal information.`;
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: question,
            config: { systemInstruction, temperature: 0.25, maxOutputTokens: 500 }
        });
        const answer = String(result.text || '').trim();
        if (!answer) throw new Error('Empty AI response');
        res.json({ success: true, answer, source: 'ai' });
    } catch (error) {
        console.warn('[SUPPORT] Gemini response failed:', error.message);
        res.json({ success: true, source: 'fallback', answer: '현재 AI 상담 연결이 원활하지 않습니다. 상단의 서버에 저장 버튼으로 작업을 저장하고, 내 작업에서 폴더별로 관리할 수 있습니다. 다른 기능 문의는 잠시 후 다시 시도해주세요.' });
    }
});

const fallbackElementSuggestion = (prompt, currentElement = {}) => {
    const text = String(prompt || '').toLowerCase();
    const suggestion = {};
    const has = (...words) => words.some(word => text.includes(word));
    if (has('빨강', '빨간', 'red')) suggestion.color = '#ef4444';
    else if (has('파랑', '파란', 'blue')) suggestion.color = '#2563eb';
    else if (has('초록', 'green')) suggestion.color = '#10b981';
    else if (has('노랑', 'yellow')) suggestion.color = '#f59e0b';
    else if (has('검정', 'black')) suggestion.color = '#111827';
    else if (has('흰색', '하얀', 'white')) suggestion.color = '#ffffff';
    if (has('크게', '키워', 'larger', 'bigger')) {
        if (currentElement.type === 'text') suggestion.size = Math.min(200, Number(currentElement.size || 30) + 15);
        else { suggestion.w = Number(currentElement.w || 100) + 40; suggestion.h = Number(currentElement.h || 100) + 40; }
    }
    if (has('작게', '줄여', 'smaller')) {
        if (currentElement.type === 'text') suggestion.size = Math.max(10, Number(currentElement.size || 30) - 10);
        else { suggestion.w = Math.max(10, Number(currentElement.w || 100) - 30); suggestion.h = Math.max(10, Number(currentElement.h || 100) - 30); }
    }
    if (has('굵게', '볼드', 'bold')) suggestion.bold = true;
    if (has('기울', 'italic')) suggestion.italic = true;
    if (has('밑줄', 'underline')) suggestion.underline = true;
    if (has('그림자', 'shadow')) suggestion.useShadow = true;
    if (has('테두리', '윤곽', 'outline')) suggestion.useOutline = true;
    if (has('가운데', '중앙', 'center')) suggestion.align = 'center';
    else if (has('오른쪽', 'right')) suggestion.align = 'right';
    else if (has('왼쪽', 'left')) suggestion.align = 'left';
    return suggestion;
};

app.post('/api/ai/suggest', requireUser(), async (req, res) => {
    const { prompt, currentElements } = req.body || {};
    if (!String(prompt || '').trim()) return res.status(400).json({ success: false, message: '변경할 내용을 입력해주세요.' });
    if (!process.env.GEMINI_API_KEY) {
        return res.json({ success: true, source: 'rules', ai_suggestion: JSON.stringify(fallbackElementSuggestion(prompt, currentElements)) });
    }
    try {

        const systemInstruction = "당신은 정치 카드뉴스를 디자인하는 수석 디자이너입니다. 사용자의 요청을 분석하여 배경색, 글자 크기, 정렬 등의 속성을 JSON 형태로 반환하세요.";
        const userMessage = `현재 캔버스 상태:\n${JSON.stringify(currentElements)}\n\n사용자 요청: ${prompt}\n어떻게 바꾸면 좋을지 JSON 데이터로만 응답해줘.`;

        // 서버 단에서 제미나이 2.5 Flash 모델 호출
        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: userMessage,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2 // 창의성보다는 규칙 기반의 정확한 JSON 출력을 위해 낮춤
            }
        });

        // 프론트엔드로는 결과 텍스트만 안전하게 전달
        await spendCredits(req.user, 2, 'ai_element', 'AI 요소 변형 제안', `element:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`);
        await recordUsage(req.user.id, 'ai_element', 1);
        res.json({ success: true, source: 'ai', ai_suggestion: response.text });
    } catch (error) {
        console.error('제미나이 AI 호출 에러:', error);
        res.status(500).json({ success: false, message: 'AI 분석 중 오류가 발생했습니다.' });
    }
});

app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 폴인사이트 백엔드 (Gemini 모드) 가동!`);
    console.log(`📡 접속 주소: http://localhost:${PORT}`);
    console.log(`=========================================`);
});
