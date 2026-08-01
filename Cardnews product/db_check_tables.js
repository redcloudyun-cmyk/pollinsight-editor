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
    console.log("=== SHOW TABLES ===");
    const [tables] = await pool.query("SHOW TABLES");
    console.log(JSON.stringify(tables, null, 2));
    
    for (let t of tables) {
      const tableName = Object.values(t)[0];
      console.log(`\n=== TABLE: ${tableName} (ROW COUNT) ===`);
      const [count] = await pool.query(`SELECT COUNT(*) as count FROM \`${tableName}\``);
      console.log(`Count: ${count[0].count}`);
    }
  } catch (err) {
    console.error("Error showing tables:", err);
  } finally {
    await pool.end();
  }
})();
