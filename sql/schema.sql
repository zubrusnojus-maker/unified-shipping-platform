-- Unified Shipping Platform Database Schema
-- Combines data models from all merged repositories

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- CONVERSATIONS TABLE (from chatbot)
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  messages JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);

-- ============================================
-- MEMORIES TABLE (from chatbot)
-- ============================================
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  keywords TEXT[] DEFAULT '{}',
  timestamp TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_keywords ON memories USING GIN(keywords);

-- ============================================
-- SHIPMENTS TABLE (from shipping)
-- ============================================
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Customer info
  customer_name TEXT,
  email TEXT,
  phone TEXT,

  -- Destination address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state_region TEXT,
  postcode TEXT,
  country TEXT,

  -- Package dimensions
  weight_kg NUMERIC,
  length_cm NUMERIC,
  width_cm NUMERIC,
  height_cm NUMERIC,
  contents_description TEXT,
  declared_value NUMERIC,
  currency TEXT DEFAULT 'USD',

  -- Preferences
  speed_preference TEXT,
  insurance_required BOOLEAN DEFAULT false,

  -- Quotes from providers
  quotes_json JSONB,
  chosen_aggregator TEXT,
  chosen_service TEXT,
  chosen_price NUMERIC,
  chosen_currency TEXT,

  -- Tracking and status
  tracking_number TEXT,
  label_url TEXT,
  provider_carrier TEXT,
  status TEXT DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_shipments_user_id ON shipments(user_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at);

-- ============================================
-- AGENT_TASKS TABLE (from shipping/agents)
-- ============================================
CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  task_data JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  progress INTEGER DEFAULT 0,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_user_id ON agent_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at ON agent_tasks(created_at);

-- ============================================
-- AUDIT LOG (optional, for tracking changes)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- ============================================
-- UPDATE TIMESTAMP TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['users', 'conversations', 'shipments', 'agent_tasks'])
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
      CREATE TRIGGER update_%s_updated_at
        BEFORE UPDATE ON %s
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    ', t, t, t, t);
  END LOOP;
END;
$$;

-- ============================================
-- HELPER VIEWS
-- ============================================

-- Recent shipments with user info
CREATE OR REPLACE VIEW recent_shipments AS
SELECT
  s.*,
  u.email as user_email,
  u.name as user_name
FROM shipments s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY s.created_at DESC
LIMIT 100;

-- Active agent tasks
CREATE OR REPLACE VIEW active_agent_tasks AS
SELECT
  at.*,
  u.email as user_email
FROM agent_tasks at
LEFT JOIN users u ON at.user_id = u.id
WHERE at.status IN ('waiting', 'active')
ORDER BY at.created_at DESC;

-- User memory summary
CREATE OR REPLACE VIEW user_memory_summary AS
SELECT
  user_id,
  COUNT(*) as memory_count,
  array_agg(DISTINCT type) as memory_types,
  MAX(created_at) as last_memory_at
FROM memories
GROUP BY user_id;

-- ============================================
-- INITIAL DATA (optional)
-- ============================================

-- Insert a default system user if needed
INSERT INTO users (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'system@unified.local', 'System')
ON CONFLICT (email) DO NOTHING;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO unified;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO unified;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO unified;
