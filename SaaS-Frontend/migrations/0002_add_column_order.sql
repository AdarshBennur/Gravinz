-- Migration: Add column order tracking for Notion imports
-- This migration adds support for preserving Notion column order

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notion_column_order JSONB;
