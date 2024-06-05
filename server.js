require('dotenv').config()

const express = require("express")
const app = express()

const Pool = require('pg').Pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: 'localhost',
  database: 'GRB',
  password: process.env.DB_PASSWORD,
  port: 5432,
})

app.use(express.json());

app.get('/customer', async (req, res) => {
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

app.get('/customer::username', async (req, res) => {
    try {
      const client = await pool.connect();
      const result = await client.query("SELECT password FROM Customer WHERE username = " + "'" + req.params[":username"] + "';" );
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