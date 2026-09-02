-- IMPL-MEM0-1: durable chat sessions columns for Mem0 chat-memory proposal
-- Additive only — does not alter existing chat_messages schema.

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_role_time
  ON chat_sessions(user_id, role, last_message_at DESC NULLS LAST);

COMMENT ON COLUMN chat_sessions.role IS 'doctor|nurse|admin at session create (role-scoped lists)';
COMMENT ON COLUMN chat_sessions.last_message_at IS 'Updated on each persisted turn for Recent Sessions ordering';
COMMENT ON COLUMN chat_sessions.metadata IS 'Optional session metadata JSON';
