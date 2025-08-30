// routes/accounts.js

// routes/accounts.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const accountController = require('../controllers/accountController');

// create account (existing)
router.post('/', requireAuth, accountController.createAccountForUser);

// money operations
router.post('/:accountId/deposit', requireAuth, accountController.deposit);
router.post('/:accountId/withdraw', requireAuth, accountController.withdraw);

// transfer: from one account id to another account id
router.post('/:fromAccountId/transfer/:toAccountId', requireAuth, accountController.transfer);

// view history / balance
router.get('/:accountId/history', requireAuth, accountController.getHistory);
router.get('/:accountId/balance', requireAuth, accountController.getBalance);

console.log(accountController);


module.exports = router;
