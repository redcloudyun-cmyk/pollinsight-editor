const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // DB 통신을 위한 mysql2 패키지 불러오기
const bcrypt = require('bcrypt');

const app = express();
const port = 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==========================================
// 1. MySQL 데이터베이스 연결 풀(Pool) 생성
// ==========================================
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',             // TODO: 본인의 MySQL 아이디로 변경 (예: root)
    password: '10928900',     // TODO: 본인의 MySQL 비밀번호로 변경
    database: 'campaign_db',  // TODO: 생성해둔 데이터베이스 이름으로 변경
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ==========================================
// 2. 카드뉴스 데이터 저장 API 엔드포인트
// ==========================================
app.post('/api/cards/save', async (req, res) => {
    const { title, candidateName, state } = req.body;

    console.log('=== 프론트엔드에서 데이터가 도착했습니다! ===');
    console.log(`캠페인명: ${title}`);
    console.log(`후보자명: ${candidateName}`);

    try {
        // DB에 저장할 쿼리 작성 (JSON 데이터는 문자열로 변환하여 저장)
        const insertQuery = `
            INSERT INTO campaign_cards (title, candidate_name, design_state) 
            VALUES (?, ?, ?)
        `;

        // 쿼리 실행
        const [result] = await pool.execute(insertQuery, [
            title,
            candidateName,
            JSON.stringify(state) // 객체를 JSON 문자열로 변환하여 JSON 컬럼에 삽입
        ]);

        console.log('DB 저장 완료! Insert ID:', result.insertId);

        // 프론트엔드에 성공 응답 보내기
        res.json({ success: true, message: '데이터베이스에 성공적으로 저장되었습니다.', id: result.insertId });

    } catch (error) {
        console.error('DB 저장 중 오류 발생:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
});
// --- [회원가입 API] ---
app.post('/api/signup', async (req, res) => {
    const { username, password, name, camp_id, role } = req.body;

    try {
        // 1. 비밀번호 암호화
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. 권한(role) 기본값 설정
        const userRole = role || 'VIEWER';
        const userCampId = camp_id || null;

        // 3. DB에 유저 정보 저장 쿼리 (Promise 방식의 pool 사용)
        const sql = `
            INSERT INTO users (username, password, name, camp_id, role) 
            VALUES (?, ?, ?, ?, ?)
        `;

        const [result] = await pool.execute(sql, [username, hashedPassword, name, userCampId, userRole]);

        console.log(`새로운 회원 가입 완료! (ID: ${result.insertId})`);
        res.status(201).json({
            message: '회원가입이 성공적으로 완료되었습니다!',
            userId: result.insertId
        });

    } catch (error) {
        // 아이디 중복 에러 처리 (MySQL 에러 코드 1062)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
        }
        console.error('서버 처리/DB 에러:', error);
        res.status(500).json({ message: '서버 처리 중 오류가 발생했습니다.' });
    }
});
// --- [여기에 로그인 API 코드 추가] ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1. DB에서 사용자가 입력한 아이디 찾기
        const sql = 'SELECT * FROM users WHERE username = ?';
        const [rows] = await pool.execute(sql, [username]);

        if (rows.length === 0) {
            return res.status(401).json({ message: '존재하지 않는 아이디입니다.' });
        }

        const user = rows[0];

        // 2. 비밀번호 확인 (bcrypt 사용)
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
        }

        // 3. 로그인 성공!
        res.status(200).json({
            message: '로그인 성공!',
            userId: user.id
        });

    } catch (error) {
        console.error('로그인 DB 처리 중 에러:', error);
        res.status(500).json({ message: '서버 처리 중 오류가 발생했습니다.' });
    }
});
// --- [여기에 카드 저장 API 코드 추가] ---
app.post('/api/cards', async (req, res) => {
    // 1. 프론트엔드(에디터)에서 보낸 작업물 데이터 받기
    // (userId는 localStorage에서, 나머지는 에디터 입력창에서 가져올 예정입니다)
    const { userId, title, content } = req.body;

    try {
        // 2. DB의 campaign_cards 테이블에 데이터 저장
        // (주의: 테이블의 실제 컬럼명에 맞게 title, content 부분을 추후 수정해야 할 수 있습니다)
        const sql = 'INSERT INTO campaign_cards (user_id, title, content) VALUES (?, ?, ?)';
        const [result] = await pool.execute(sql, [userId, title, content]);

        // 3. 성공 시 프론트엔드로 확인 메시지 보내기
        res.status(201).json({
            message: '카드뉴스가 성공적으로 저장되었습니다!',
            cardId: result.insertId
        });

    } catch (error) {
        console.error('카드 저장 중 DB 에러:', error);
        res.status(500).json({ message: '데이터베이스 저장 중 오류가 발생했습니다.' });
    }
});
// ------------------------------------
// ------------------------------------
// 서버 실행
app.listen(port, () => {
    console.log(`서버 구동 완료! 🚀 http://localhost:${port}`);
});
