const express = require("express")
const app = express()

const Pool = require('pg').Pool
const pool = new Pool({
  user: 'client',
  host: 'localhost',
  database: 'GRB',
  password: 'inipasswordwkwk',
  port: 5432,
})

app.use(express.json());

app.get('/data', async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT username FROM Customer');
      res.json(result.rows);
      client.release();
    } catch (err) {
      console.error('Error executing query', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

app.get("/", (req, res) => {
    console.log("get called")
    res.send("wow")
})

app.listen(3000, (err) => {
    if (err) console.log("Error: server setup failed")
    else console.log("Server started on port 3000")
})