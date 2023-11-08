const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const upload = multer();
const app = express();
const db = new sqlite3.Database('users.db');
var http = require('http');
const busboy = require('busboy');
const fs = require('fs');
const formData = require('form-data');
const path = require('path');
const { json } = require('body-parser');
const resPath = '.\\dist\\audio';

var recordingNames = JSON.parse(fs.readFileSync(path.join(resPath,'index.json'),{encoding:'utf8', flag:'r'}));
console.log(recordingNames);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('dist'));
db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
      )
    `);
    db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      authorId INTEGER,
      title TEXT,
      likes INTEGER,
      source TEXT NOT NULL UNIQUE,
      timestamp TEXT,
      replyTo INTEGER,
      FOREIGN KEY(authorId) REFERENCES users(id),
      FOREIGN KEY(replyTo) REFERENCES posts(id)
    );
    
    `)
  });

app.get('/', (req, res) => {
    res.redirect('/login');
  });
// Signup POST route
app.get('/signup', (req, res) => {
  var username = req.get('username');
  var password = req.get('password');
  console.log(JSON.stringify(req.headers));

  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err) => {
    if (err) {
      res.status(400).send('Error creating user');
    } else {
      res.status(200).send('Success');
    }
  });
});

// Login route
app.get('/login', (req, res) => {
  res.sendFile( __dirname + "/" + "dist/login.html" );
});

// upload 
app.post('/upload',(req,res)=>{
  const bb = busboy({ headers: req.headers });
  bb.on('file', (name, file, info,) => {
    var filename = info.filename;
    //recordingNames.push(filename);
    //console.log(recordingNames);
    var insert_query =`INSERT INTO posts (authorId,title,likes,source,timestamp,replyTo) VALUES(
      ${req.cookies['userId']},'${req.get('Title')}',0,"${filename}",${req.get('Timestamp')},${req.get('replyTo')})`
    console.log(insert_query);
    db.get(insert_query,(err)=>{
        console.log(err);
      });
    const saveTo = path.join(resPath,`${filename}.mp3`);
    console.log(saveTo);
    file.pipe(fs.createWriteStream(saveTo));
  });
  bb.on('close', () => {
    res.writeHead(200, { 'Connection': 'close' });
    res.end(`That's all folks!`);
  });
  req.pipe(bb);
})
app.get('/like',function(req,res){
  var postId = req.get('postId');
  var likequery = `UPDATE posts
  SET likes = likes + 1
  WHERE id = ${postId}
  ` 
  db.get(likequery,(err)=>{if(err){console.log(err)}});
  res.status(200);  
});
// give list
app.post('/update/page',function(req,res){
  var search_term = req.get('search_term');
  var sort_by = req.get('sort_by');
  console.log(`search : ${search_term} and sort : ${sort_by}`);
  var query = '';
  if(sort_by == 'Sort by: New')
  {
    query = `SELECT posts.id, users.username AS author, posts.likes, posts.source, posts.replyTo,posts.timestamp,posts.title
    FROM posts
    JOIN users ON posts.authorId = users.id
    WHERE posts.title LIKE '%${search_term}%'
    ORDER BY posts.id DESC    
    `
  }
  else if(sort_by == 'Sort by: Likes')
  {
    query =`SELECT posts.id, users.username AS author, posts.likes, posts.source, posts.replyTo,posts.timestamp,posts.title
    FROM posts
    JOIN users ON posts.authorId = users.id
    WHERE posts.title LIKE '%${search_term}%'
    ORDER BY posts.likes DESC
    `
  }
  else if(sort_by == 'Sort by: Comments')
  {
    query =`SELECT posts.id, users.username AS author, posts.likes, posts.source, posts.replyTo,posts.timestamp,posts.title, COUNT(replies.id) AS reply_count
    FROM posts
    JOIN users ON posts.authorId = users.id
    LEFT JOIN posts AS replies ON replies.replyTo = posts.id
    WHERE posts.title LIKE '%${search_term}%'
    GROUP BY posts.id
    ORDER BY reply_count DESC
    `
  }
  if(search_term == '')
  {
    if(sort_by == 'Sort by: New')
    {
      query = `SELECT posts.id, users.username AS author, posts.likes, posts.source, posts.replyTo,posts.timestamp,posts.title
      FROM posts
      JOIN users ON posts.authorId = users.id
      ORDER BY posts.id DESC    
      `
    }
    else if(sort_by == 'Sort by: Likes')
    {
      query =`SELECT posts.id, users.username AS author, posts.likes, posts.source, posts.replyTo,posts.timestamp,posts.title
      FROM posts
      JOIN users ON posts.authorId = users.id
      ORDER BY posts.likes DESC
      `
    }
    else if(sort_by == 'Sort by: Comments')
    {
      query =`SELECT posts.id, users.username AS author, posts.likes, posts.source, posts.replyTo,posts.timestamp,posts.title, COUNT(replies.id) AS reply_count
      FROM posts
      JOIN users ON posts.authorId = users.id
      LEFT JOIN posts AS replies ON replies.replyTo = posts.id
      GROUP BY posts.id
      ORDER BY reply_count DESC
      `
    }
  }
  console.log(query)
  db.all(query,(err,rows)=>{
    if(err || !rows)
    {
      console.log(err)
      res.send("[does'nt work 💀]");
    }
    else{
      console.log(rows);
      res.json(rows);
    }
  });
});
app.get('/username', (req,res) =>{
  console.log(`cookie with user id ${req.cookies['userId']} requested username`)
  db.get(`SELECT username FROM users WHERE id = ${req.cookies['userId']}`,(err,row) =>{
    if (err || !row) {
      console.log(err)
      res.status(401).send('Invalid session');
    } else {
      console.log(`sent ${row.username}`);
      res.status(200).send(row.username);
    }
  });
});
app.post('/stats', (req,res) => {
  values= [0,0,0];
  db.get(`SELECT SUM(likes) as total_likes
  FROM posts
  WHERE authorId = ${req.cookies['userId']};
  `,(err,row)=>{
    values[0] = row;
  });
  db.get(`SELECT COUNT(*) AS num_posts
  FROM posts
  WHERE authorId = ${req.cookies['userId']};  
  `,(err,row)=>{
    values[1] = row;
  });
  console.log('stats requested');
  db.get(`SELECT COUNT(*) AS num_replies
  FROM posts
  WHERE replyTo IN (
    SELECT id FROM posts WHERE authorId = ${req.cookies['userId']}
  );  
  `,(err,row)=>{
    values[2] = row;
  });
  console.log(values);
  res.send(JSON.stringify(values));
})
app.get('/delete', (req,res) =>{
  console.log('delete requested');
  db.get(`DELETE FROM users WHERE id = ${req.cookies['userId']}`,(err)=>{
    if(err){
      res.status(401).send('Server error : Cant delete account 💀')
    }
    else{
      res.status(200).send('success');
    }
  })
});
app.get('/login/check', (req, res) => {
  console.log('requested')
  var username = req.get('username');
  var password = req.get('password');
  db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err || !row) {
      res.status(401).send('Invalid username or password');
    } else {
      res.cookie('userId', row.id);
      res.status(200).send('success');
    }
  });
});

// Start server
app.listen(8080, () => console.log('Server started on port 3000'));

process.on('SIGINT', () => {
  var dump = JSON.stringify(recordingNames);
  fs.writeFileSync(path.join(resPath,'index.json'),dump);
  process.exit(0);
});


