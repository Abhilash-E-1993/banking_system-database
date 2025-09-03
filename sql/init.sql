-- sql/init.sql
-- Initializes bankdb and creates users, accounts and transactions tables.

CREATE DATABASE IF NOT EXISTS bankdb
  DEFAULT CHARACTER SET = utf8mb4
  DEFAULT COLLATE = utf8mb4_unicode_ci;
USE bankdb;

-- Users table: stores customers and admins
CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Accounts table: one (default) account per user for this project
CREATE TABLE IF NOT EXISTS accounts (
  account_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  account_number VARCHAR(40) NOT NULL UNIQUE,
  balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Transactions table: audit trail (immutable)
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id BIGINT UNSIGNED NOT NULL,
  `type` ENUM('deposit','withdraw','transfer') NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  from_account VARCHAR(40) NULL,
  to_account VARCHAR(40) NULL,
  description VARCHAR(255),
  CONSTRAINT fk_transactions_account FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_transactions_account (account_id),
  INDEX idx_transactions_date (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- loans table: stores loan information
CREATE TABLE loans (
    loan_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id  BIGINT UNSIGNED NOT NULL,
    loan_type ENUM('personal', 'home', 'education') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    duration_months INT NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
-- insurance table

CREATE TABLE insurance (
    insurance_id  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id  BIGINT UNSIGNED NOT NULL,
    insurance_type ENUM('life', 'health', 'vehicle') NOT NULL,
    coverage_amount DECIMAL(12,2) NOT NULL,
    premium DECIMAL(10,2) NOT NULL,
    duration_years INT NOT NULL,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

ALTER TABLE loans ADD COLUMN status ENUM('pending','approved','rejected') DEFAULT 'pending';
ALTER TABLE insurance ADD COLUMN status ENUM('pending','approved','rejected') DEFAULT 'pending';
