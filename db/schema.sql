CREATE TABLE IF NOT EXISTS jobs (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_number        VARCHAR(20) NOT NULL UNIQUE,
  job_uuid          VARCHAR(40) NULL,
  title             VARCHAR(255) NULL,
  client_name       VARCHAR(255) NULL,
  handler_name      VARCHAR(255) NULL,
  status            TINYINT NULL,
  status_description VARCHAR(50) NULL,
  date_in           DATE NULL,
  date_due          DATE NULL,
  notes             TEXT NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  last_synced_at    TIMESTAMP NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_snapshots (
  id                          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id                      INT UNSIGNED NOT NULL,
  snapshot_date               DATE NOT NULL,
  quoted_value                DECIMAL(12,2) NULL,
  estimate_hours              DECIMAL(10,2) NULL,
  actual_hours                DECIMAL(10,2) NULL,
  estimate_cost               DECIMAL(12,2) NULL,
  actual_cost                 DECIMAL(12,2) NULL,
  estimate_purchase_cost      DECIMAL(12,2) NULL,
  actual_purchase_cost        DECIMAL(12,2) NULL,
  gross_margin                DECIMAL(12,2) NULL,
  net_margin                  DECIMAL(12,2) NULL,
  gross_margin_pct            DECIMAL(6,2) NULL,
  net_margin_pct              DECIMAL(6,2) NULL,
  pct_actual_vs_estimate_hours DECIMAL(7,2) NULL,
  pct_actual_vs_estimate_cost  DECIMAL(7,2) NULL,
  created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_job_date (job_id, snapshot_date),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_number        VARCHAR(20) NOT NULL UNIQUE,
  job_uuid          VARCHAR(40) NULL,
  title             VARCHAR(255) NULL,
  client_name       VARCHAR(255) NULL,
  handler_name      VARCHAR(255) NULL,
  job_type          VARCHAR(100) NULL,
  date_in           DATE NULL,
  date_due          DATE NULL,
  quoted_value      DECIMAL(12,2) NULL,
  notes             TEXT NULL,
  status            VARCHAR(20) NULL,
  weighting         TINYINT UNSIGNED NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  last_synced_at    TIMESTAMP NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pipeline_billing_lines (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_number        VARCHAR(20) NOT NULL,
  billing_date      DATE NULL,
  planned_value     DECIMAL(12,2) NOT NULL DEFAULT 0,
  planned_cost      DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_number (job_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_billing_lines (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_number        VARCHAR(20) NOT NULL,
  billing_date      DATE NULL,
  planned_value     DECIMAL(12,2) NOT NULL DEFAULT 0,
  planned_cost      DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_number (job_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS manual_billing_lines (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  description       VARCHAR(255) NOT NULL,
  billing_date      DATE NOT NULL,
  value             DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost              DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS handler_notes (
  handler_name      VARCHAR(255) NOT NULL PRIMARY KEY,
  notes             TEXT NULL,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
