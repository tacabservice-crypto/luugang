CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(191) PRIMARY KEY,
  firebase_uid VARCHAR(191) NULL UNIQUE,
  email VARCHAR(320) NULL,
  phone VARCHAR(40) NULL,
  username VARCHAR(191) NOT NULL,
  avatar TEXT NULL,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  win_count INT UNSIGNED NOT NULL DEFAULT 0,
  loss_count INT UNSIGNED NOT NULL DEFAULT 0,
  linked_agent_id VARCHAR(191) NULL,
  applied_promo_code VARCHAR(191) NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  profile_json JSON NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  INDEX idx_users_email (email),
  INDEX idx_users_phone (phone),
  INDEX idx_users_agent (linked_agent_id),
  INDEX idx_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  transaction_type VARCHAR(64) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  balance_after DECIMAL(18,2) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  reference_id VARCHAR(191) NULL,
  revenue_category VARCHAR(64) NULL,
  description TEXT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  transaction_json JSON NOT NULL,
  INDEX idx_wallet_user_created (user_id, created_at),
  INDEX idx_wallet_type_created (transaction_type, created_at),
  INDEX idx_wallet_reference (reference_id),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(191) PRIMARY KEY,
  username VARCHAR(191) NOT NULL UNIQUE,
  password_hash TEXT NULL,
  phone VARCHAR(40) NULL,
  location VARCHAR(191) NULL,
  promo_code VARCHAR(191) NULL UNIQUE,
  commission_rate DECIMAL(7,6) NOT NULL DEFAULT 0,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  float_balance DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  business_model VARCHAR(32) NOT NULL DEFAULT 'independent',
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  agent_json JSON NOT NULL,
  INDEX idx_agents_status_location (status, location),
  INDEX idx_agents_promo (promo_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(191) PRIMARY KEY,
  username VARCHAR(191) NOT NULL UNIQUE,
  password_hash TEXT NULL,
  name VARCHAR(191) NULL,
  permissions_json JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  location VARCHAR(191) NULL,
  cashier_locations_json JSON NULL,
  cashier_online_at BIGINT UNSIGNED NULL,
  admin_json JSON NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  INDEX idx_admin_status (status),
  INDEX idx_admin_location (location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manual_transaction_requests (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  agent_id VARCHAR(191) NULL,
  managed_by VARCHAR(32) NOT NULL,
  transaction_type VARCHAR(32) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  assigned_cashier_id VARCHAR(191) NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  resolved_at BIGINT UNSIGNED NULL,
  request_json JSON NOT NULL,
  INDEX idx_manual_status_created (status, created_at),
  INDEX idx_manual_agent_status (agent_id, status),
  INDEX idx_manual_cashier_status (assigned_cashier_id, status),
  CONSTRAINT fk_manual_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_requests (
  id VARCHAR(191) PRIMARY KEY,
  agent_id VARCHAR(191) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at BIGINT UNSIGNED NOT NULL,
  resolved_at BIGINT UNSIGNED NULL,
  request_json JSON NOT NULL,
  INDEX idx_agent_requests_agent_created (agent_id, created_at),
  INDEX idx_agent_requests_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_transactions (
  id VARCHAR(191) PRIMARY KEY,
  agent_id VARCHAR(191) NOT NULL,
  player_id VARCHAR(191) NULL,
  transaction_type VARCHAR(64) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at BIGINT UNSIGNED NOT NULL,
  transaction_json JSON NOT NULL,
  INDEX idx_agent_transactions_agent_created (agent_id, created_at),
  INDEX idx_agent_transactions_type_created (transaction_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_rooms (
  id VARCHAR(191) PRIMARY KEY,
  status VARCHAR(32) NOT NULL,
  bet_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at BIGINT UNSIGNED NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  room_json JSON NOT NULL,
  INDEX idx_rooms_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tournaments (
  id VARCHAR(191) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  entry_fee DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  prize_pool DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  start_at BIGINT UNSIGNED NOT NULL,
  end_at BIGINT UNSIGNED NULL,
  tournament_json JSON NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  INDEX idx_tournaments_status_start (status, start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vip_subscriptions (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  tier_key VARCHAR(64) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  starts_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  subscription_json JSON NOT NULL,
  INDEX idx_vip_user_status (user_id, status),
  INDEX idx_vip_expiry (expires_at),
  CONSTRAINT fk_vip_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id VARCHAR(191) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  format VARCHAR(32) NOT NULL,
  placement VARCHAR(32) NOT NULL,
  company_name VARCHAR(255) NULL,
  title VARCHAR(255) NULL,
  starts_at BIGINT UNSIGNED NULL,
  ends_at BIGINT UNSIGNED NULL,
  campaign_json JSON NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  INDEX idx_ads_enabled_schedule (enabled, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(191) PRIMARY KEY,
  setting_json JSON NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_otp_challenges (
  subject_id VARCHAR(191) PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  resend_at BIGINT UNSIGNED NULL,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  verified_at BIGINT UNSIGNED NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  INDEX idx_otp_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cashier_payments (
  id VARCHAR(191) PRIMARY KEY,
  cashier_id VARCHAR(191) NOT NULL,
  period_key VARCHAR(16) NOT NULL,
  salary DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  bonus DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  paid_at BIGINT UNSIGNED NOT NULL,
  paid_by VARCHAR(191) NOT NULL,
  payment_json JSON NOT NULL,
  UNIQUE KEY uq_cashier_period (cashier_id, period_key),
  INDEX idx_cashier_payments_paid (paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
