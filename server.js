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

app.patch(
  '/updateAccount',
  [
    body('username').isString().withMessage('Invalid username data type'),
    body('oldPassword').isString().withMessage('Invalid old password data type'),
    body('newPassword').isString().withMessage('Invalid new password data type'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() }).end();
    }
    const {username, oldPassword, newPassword} = req.body;
    let client;
    try{
      client = await pool.connect();
      await client.query("BEGIN;");

      const existingUsername = result.rows[0]?.username;
      if (!existingUsername) {
        return res.status(404).json({ error: 'Username not found' }).end();
      }

      const loginAttempt = await client.query('SELECT * FROM Customer WHERE username = $1 AND password = $2 LIMIT 1', [username, oldPassword]);
      const isAuthorized = loginAttempt.rowCount > 0;
      if (!isAuthorized) {
        return res.status(401).json({ error: 'Unauthorized' }).end();
      }

      await client.query(
        "UPDATE Customer SET password = $1 WHERE username = $2;",
        [newPassword, username]
      );
      await client.query("COMMIT;");
      res.status(200).end();
    }
    catch (err){
      await client.query('ROLLBACK');
      res.json(err);
      res.status(500).end();
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

      if (books.length > 0) {
        books.forEach (async book => {
          await client.query(
            'INSERT INTO "PurchaseItem" ("purchaseNumber", "bookNumber", quantity)' +
            "VALUES ($1, $2, $3)",
            [purchaseNumber, book.bookNumber, book.quantity]
          );
        })
      }


      if (promos.length > 0) {
        promos.forEach(async promo => {
          await client.query(
            'INSERT INTO "PromoUsage" ("promoCode", "purchaseNumber")' +
            "VALUES ($1, $2)",
            [promo.promoCode, purchaseNumber]
          );
        });
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

app.get('/bookName/:searchName',
  async (req, res) => {

    const bookNameLike = req.params.searchName;

    let client;
    try{
      client = await pool.connect();

      const result = await client.query(
        'SELECT' +
	      '"Book"."bookNumber",' +
	      '"Book"."bookName",' +
        '"Book"."price",' +
        '"Book"."pages",' +
        '"Book"."publicationYear",' +
        '"Author"."authorNumber",' +
        '"Author"."authorName",' +
        '"Book"."publisherName",' +
        '"BookTagging"."bookTag",' +
        '(SELECT SUM("amount") FROM "InventoryItem" WHERE "bookNumber" = "Book"."bookNumber") AS "inStock"' +
        'FROM' +
	      '"Book" LEFT JOIN "AuthorWrites" ON "Book"."bookNumber" = "AuthorWrites"."bookNumber"' +
	      'LEFT JOIN "Author" ON "AuthorWrites"."authorNumber" = "Author"."authorNumber"' +
	      'LEFT JOIN "BookTagging" ON "Book"."bookNumber" = "BookTagging"."bookNumber"' +
        'WHERE' +
	      '"Book"."bookName" ILIKE LOWER($1);',
        ['%' + bookNameLike + '%']
      );
      const books = result.rows;
      res.status(200).json(books).end();
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

app.get('/bookNumber/:bookNumber',
  async (req, res) => {

    const bookNameSearched = req.params.bookNumber;

    let client;
    try{
      client = await pool.connect();

      const result = await client.query(
        'SELECT' +
	      '"Book"."bookNumber",' +
	      '"Book"."bookName",' +
        '"Book"."price",' +
        '"Book"."pages",' +
        '"Book"."publicationYear",' +
        '"Author"."authorNumber",' +
        '"Author"."authorName",' +
        '"Book"."publisherName",' +
        '"BookTagging"."bookTag",' +
        '(SELECT SUM("amount") FROM "InventoryItem" WHERE "bookNumber" = "Book"."bookNumber") AS "inStock"' +
        'FROM' +
	      '"Book" LEFT JOIN "AuthorWrites" ON "Book"."bookNumber" = "AuthorWrites"."bookNumber"' +
	      'LEFT JOIN "Author" ON "AuthorWrites"."authorNumber" = "Author"."authorNumber"' +
	      'LEFT JOIN "BookTagging" ON "Book"."bookNumber" = "BookTagging"."bookNumber"' +
        'WHERE' +
	      '"Book"."bookNumber" = $1;',
        [bookNameSearched]
      );
      const books = result.rows;
      res.status(200).json(books).end();
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

app.post('/reviewbook',
  [
    body('username').isString().withMessage('Invalid username data type'),
    body('bookNumber').isInt().withMessage('Invalid bookNumber data type'),
    body('rating').isInt().withMessage('Invalid rating data type'),
    body('comment').isString().withMessage('Invalid comment data type'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() }).end();
    }
    const {username, bookNumber, rating, comment} = req.body;
    let client;
    try{
      client = await pool.connect();
      await client.query("BEGIN;");
      await client.query(
        'INSERT INTO "Review" ("username", "bookNumber", "rating", "comment")' +
        'VALUES ($1, $2, $3, $4);',
        [username, bookNumber, rating, comment]
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

app.listen(3000, (err) => {
    if (err) console.log("Error: server setup failed")
    else console.log("Server started on port 3000")
})