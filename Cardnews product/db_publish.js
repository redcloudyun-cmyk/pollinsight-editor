require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  
  try {
    console.log("=== PUBLISHING SAMPLE PROFILES ===");
    const [result] = await pool.query("UPDATE digital_profiles SET is_published = 1 WHERE id IN (10, 11, 12, 13, 14, 15, 16, 17, 18, 19)");
    console.log(`Updated ${result.affectedRows} profiles.`);
  } catch (err) {
    console.error("Error publishing profiles:", err);
  } finally {
    await pool.end();
  }
})();
