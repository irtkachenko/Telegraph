-- Add content length check constraint for messages table
-- This ensures content length is between 1 and 3000 characters
ALTER TABLE messages 
ADD CONSTRAINT check_content_length 
CHECK (char_length(content) >= 1 AND char_length(content) <= 3000);

-- Update email_verified column name to match TypeScript schema
-- This migration assumes the column has already been renamed manually
-- If not, uncomment the following line:
-- ALTER TABLE "user" RENAME COLUMN email_verified TO emailVerified;
