const bcrypt = require('bcrypt');
const newPassword = 'dbmsproject';

bcrypt.hash(newPassword, 10, (err, hash) => {
  if (err) throw err;
  console.log('New Hashed Password:', hash);
});