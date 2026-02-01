-- PostgreSQL initialization script
-- Enable required extensions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create test database for testing
CREATE DATABASE syntra_test;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE syntra TO syntra;
GRANT ALL PRIVILEGES ON DATABASE syntra_test TO syntra;
