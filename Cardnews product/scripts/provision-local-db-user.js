require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_BOOTSTRAP_USER || process.env.DB_USER,
        password: process.env.DB_BOOTSTRAP_PASSWORD || process.env.DB_PASSWORD
    });
    const database = String(process.env.DB_NAME);
    const appUser = 'pollinsight_app';
    const appPassword = process.env.APP_DB_PASSWORD;
    if (!/^[A-Za-z0-9_]+$/.test(database) || !appPassword) throw new Error('Missing database or application password');
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`CREATE USER IF NOT EXISTS '${appUser}'@'localhost' IDENTIFIED BY ?`, [appPassword]);
    await connection.query(`ALTER USER '${appUser}'@'localhost' IDENTIFIED BY ?`, [appPassword]);
    await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES ON \`${database}\`.* TO '${appUser}'@'localhost'`);
    await connection.query('FLUSH PRIVILEGES');
    await connection.end();
    console.log('Application database user provisioned.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
