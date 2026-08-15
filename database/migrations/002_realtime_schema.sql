CREATE TABLE IF NOT EXISTS matchmaking_queue (
  user_id VARCHAR(191) PRIMARY KEY,
  status VARCHAR(40) NOT NULL,
  bet_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  capacity SMALLINT UNSIGNED NOT NULL DEFAULT 2,
  game_mode VARCHAR(20) NOT NULL DEFAULT 'solo',
  updated_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  record_json JSON NOT NULL,
  INDEX idx_matchmaking_active (status, expires_at),
  INDEX idx_matchmaking_queue (bet_amount, capacity, game_mode, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
