-- Migration: Extend contacts table for full Notion integration
-- This migration adds support for dynamic Notion schema preservation

-- Add new timestamp columns for email tracking
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_email_date TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS followup1_date TIMESTAMP;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS followup2_date TIMESTAMP;

-- Add job link field
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS job_link TEXT;

-- Convert status from enum to text to support flexible Notion statuses
ALTER TABLE contacts ALTER COLUMN status TYPE TEXT;

-- Drop the old enum type if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_status') THEN
        DROP TYPE contact_status CASCADE;
    END IF;
END $$;

-- Add JSONB column to store complete Notion row data (all columns dynamically)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notion_data JSONB;

-- Add integer column to preserve Notion row order
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notion_row_order INTEGER;

-- Create index on notion_data for better query performance
CREATE INDEX IF NOT EXISTS idx_contacts_notion_data ON contacts USING GIN (notion_data);
