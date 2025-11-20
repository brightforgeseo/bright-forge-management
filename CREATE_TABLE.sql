-- ========================================
-- CREATE CLIENT_BOARDS TABLE
-- Run this FIRST before importing data
-- ========================================

CREATE TABLE IF NOT EXISTS client_boards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  board_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index on board_data for faster queries
CREATE INDEX IF NOT EXISTS idx_client_boards_board_data ON client_boards USING gin (board_data);

-- Enable Row Level Security (RLS)
ALTER TABLE client_boards ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Enable all access for authenticated users" ON client_boards
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Success message
SELECT 'Table client_boards created successfully!' as message;
