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
  INDEX idx_manual_cashier_status (assigned_cashier_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
