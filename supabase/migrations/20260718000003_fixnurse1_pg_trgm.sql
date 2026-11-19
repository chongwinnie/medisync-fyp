-- FIX-NURSE-1 N-003: enable pg_trgm for patient name similarity ranking in find_patient
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Optional supporting index for ILIKE / similarity on patient names
CREATE INDEX IF NOT EXISTS idx_patients_full_name_trgm
  ON patients USING gin (full_name gin_trgm_ops);
