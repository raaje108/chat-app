const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
});

db.getConnection()
    .then(() => console.log('✅ MySQL connected!'))
    .catch((err) => console.error('❌ DB connection failed:', err));

module.exports = db;