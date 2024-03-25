const dotenv = require('dotenv');
dotenv.config();
const { Pool } = require('pg');

const connectDB = async () => {
  const pool = new Pool({
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    host: process.env.PG_HOST,
    database: process.env.PG_DBNAME,
    port: Number(process.env.PG_PORT),
  });
  const endPool = async () => {
    await pool.end();
  };
  try {
    const client = await pool.connect();
    return { client, endPool };
  } catch (error) {
    console.error('Error while connecting DB: ', error);
    throw error;
  }
};

module.exports = connectDB;
