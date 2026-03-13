-- Migration to rename 'user' table to 'users' to avoid PostgreSQL reserved word conflict
-- This fixes MED-03 from the technical audit

-- Rename the table from 'user' to 'users'
ALTER TABLE "user" RENAME TO "users";

-- Update comment to reflect the new table name
COMMENT ON TABLE "users" IS 'User accounts table - renamed from "user" to avoid PostgreSQL reserved word';
