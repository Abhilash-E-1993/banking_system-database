// entry

const express = require('express');
const db = require('./config/db'); // import DB connection
const session = require('express-session');
const cors = require('cors');
const app = express();
const PORT = 3000;


const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true } // secure:true when using HTTPS in prod
}));

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);

// Test DB connection
db.query('SELECT 1')
  .then(() => {
    console.log('✅ MySQL Database connected successfully!');
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err);
  });

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}/register.html`);
});
