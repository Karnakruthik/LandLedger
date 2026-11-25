CREATE TABLE IF NOT EXISTS accounts (
 id VARCHAR(36) PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL,
 pass_hash VARCHAR(100) NOT NULL, role VARCHAR(16) NOT NULL, wallet VARCHAR(42) UNIQUE,
 challenge VARCHAR(200), challenge_until BIGINT
);
CREATE TABLE IF NOT EXISTS properties (
 id VARCHAR(40) PRIMARY KEY, applicant VARCHAR(36) NOT NULL,
 owner_name VARCHAR(100) NOT NULL, identity_ref VARCHAR(80) NOT NULL, initial_wallet VARCHAR(42) NOT NULL,
 owner_wallet VARCHAR(42) NOT NULL, location VARCHAR(150) NOT NULL, state VARCHAR(80) NOT NULL,
 district VARCHAR(80) NOT NULL, survey VARCHAR(80) NOT NULL, area VARCHAR(32) NOT NULL,
 property_type VARCHAR(32) NOT NULL, address VARCHAR(300) NOT NULL,
 created_at BIGINT NOT NULL, document LONGBLOB NOT NULL, status VARCHAR(24) NOT NULL,
 review_note VARCHAR(300), proposed_wallet VARCHAR(42), tx_hash VARCHAR(66), block_number BIGINT, last_verification VARCHAR(24),
 UNIQUE(state,district,location,survey),
 FOREIGN KEY(applicant) REFERENCES accounts(id)
);
CREATE TABLE IF NOT EXISTS chain_events (
 tx_hash VARCHAR(66) NOT NULL, log_index INT NOT NULL, property_id VARCHAR(64) NOT NULL,
 kind VARCHAR(32) NOT NULL, previous_wallet VARCHAR(42) NOT NULL, new_wallet VARCHAR(42) NOT NULL,
 block_number BIGINT NOT NULL, recorded_at BIGINT NOT NULL, PRIMARY KEY(tx_hash,log_index)
);
CREATE TABLE IF NOT EXISTS purchase_requests (
 property_id VARCHAR(40) NOT NULL, buyer VARCHAR(36) NOT NULL,
 seller_wallet VARCHAR(42) NOT NULL, status VARCHAR(24) NOT NULL, created_at BIGINT NOT NULL,
 PRIMARY KEY(property_id,buyer), FOREIGN KEY(property_id) REFERENCES properties(id), FOREIGN KEY(buyer) REFERENCES accounts(id)
);
CREATE TABLE IF NOT EXISTS verification_history (
 account_id VARCHAR(36) NOT NULL, property_id VARCHAR(40) NOT NULL,
 result VARCHAR(24) NOT NULL, viewed_at BIGINT NOT NULL, PRIMARY KEY(account_id,property_id), FOREIGN KEY(account_id) REFERENCES accounts(id)
);
CREATE TABLE IF NOT EXISTS chain_cursor (
 id INT PRIMARY KEY, deployment VARCHAR(150), next_block BIGINT NOT NULL
);
INSERT INTO chain_cursor(id,next_block) SELECT 1,0 WHERE NOT EXISTS (SELECT 1 FROM chain_cursor WHERE id=1);
