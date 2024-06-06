require('dotenv').config()

const express = require("express")
const { body, validationResult } = require('express-validator');
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

app.post('/registerAccount',
  [
    body('username').isString().withMessage('Invalid username data type'),
    body('password').isString().withMessage('Invalid password data type'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() }).end();
    }
    const {username, password} = req.body;
    let client;
    try{
      client = await pool.connect();
      await client.query("BEGIN;");
      await client.query(
        "INSERT INTO Customer (username, password)" +
        "VALUES ($1, $2);",
        [username, password]
      );
      await client.query("COMMIT;");
      res.status(201).end();
    }
    catch (err){
      await client.query('ROLLBACK');
      res.json(err);
      res.status(500).end();
    }
    finally{
      client.release();
    }
  }
);

app.get('/loginAccount',
  [
    body('username').isString().withMessage('Invalid username data type'),
    body('password').isString().withMessage('Invalid password data type'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() }).end();
    }
    const {username, password} = req.body;
    let client;
    try{
      client = await pool.connect();

      const checkUserResult = await client.query('SELECT * FROM Customer WHERE username = $1 AND password = $2 LIMIT 1', [username, password]);
      const userExists = checkUserResult.rowCount > 0;

      if (userExists) {
        res.status(200).send("Logged in!").end();
      }
      else{
        res.status(401).send("Unauthorized").end();
      }
    }
    catch (err){
      res.json(err);
      res.status(500).end();
    }
    finally{
      client.release();
    }
  }
);

app.post('/purchase',
  [
    body('username').isString().withMessage('Invalid username data type'),
    body('books').isArray().withMessage('Books must be an array').bail()
      .custom((books) => {
        for (const book of books) {
          if (typeof book.bookNumber !== 'number') {
            console.log(typeof book.bookNumber);
            throw new Error('Invalid bookNumber data type');
          }
          if (typeof book.quantity !== 'number') {
            throw new Error('Invalid quantity data type');
          }
        }
        return true;
      }
    ),
    body('storageCode').isString().isLength({min: 3, max:3}).withMessage('Invalid storageCode'),
    body('promos').isArray().withMessage('Promos must be an array').bail()
      .custom((promos) => {
        for (const promo of promos) {
          if (typeof promo.promoCode !== 'string') {
            throw new Error('Invalid bookNumber data type');
          }
        }
        return true;
      }
    ),
    body('addressID').isInt().withMessage("Invalid addressID data type")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() }).end();
    }
    const {username, books, storageCode, promos, addressID} = req.body;
    let client;
    try{
      client = await pool.connect();
      
      const idResult = await client.query('SELECT "purchaseNumber" FROM "Purchase" WHERE "purchaseNumber" = (SELECT MAX("purchaseNumber") FROM "Purchase");');
      const purchaseNumber = parseInt(idResult.rows[0].purchaseNumber) + 1;

      await client.query("BEGIN;");

      await client.query(
        'INSERT INTO "Purchase" ("purchaseNumber", username, date, "storageCode", "addressID")' +
        "VALUES ($1, $2, $3, $4, $5);",
        [purchaseNumber, username, new Date(Date.now()).toISOString(), storageCode, addressID]
      );

      for (const book in books) {
        await client.query(
          'INSERT INTO "PurchaseItem" ("purchaseNumber", "bookNumber", quantity)' +
          "VALUES ($1, $2, $3)",
          [purchaseNumber, book.bookNumber, book.quantity]
        );
      }

      for (const promo in promos) {
        await client.query(
          'INSERT INTO "PromoUsage" ("promoCode", "purchaseNumber")' +
          "VALUES ($1, $2)",
          [promo.promoCode, purchaseNumber]
        );
      }

      await client.query("COMMIT;");
      res.status(201).end();
    }
    catch (err){
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).end();
    }
    finally{
      client.release();
    }
  }
);





app.get('/getpurchase', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM "Purchase";');
    res.json(result.rows);
    client.release();
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

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