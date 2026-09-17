require('dotenv').config();
const { getPool } = require('./db');

async function testDatabase() {
    try {
        const pool = getPool();

        const result = await pool.query(`
            SELECT
                current_database() AS database_name,
                current_user AS db_user,
                version() AS server_version;
        `);

        console.table(result.rows);

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('Database connection failed:');
        console.error(error.message);
        process.exit(1);
    }
}

testDatabase();
