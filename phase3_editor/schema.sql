-- 데이터베이스가 아직 없다면 아래 두 줄의 주석을 해제하고 먼저 실행해 주세요.
-- CREATE DATABASE campaign_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE campaign_db;

CREATE TABLE campaign_cards (
    id INT AUTO_INCREMENT PRIMARY KEY, -- 고유 식별자 (자동 증가)
    title VARCHAR(255) NOT NULL, -- 프로젝트/캠페인명
    candidate_name VARCHAR(100), -- 후보자명
    design_state JSON NOT NULL, -- 캔버스 디자인 상태 및 속성 (JSON 형식)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 데이터 생성(저장) 일자
);