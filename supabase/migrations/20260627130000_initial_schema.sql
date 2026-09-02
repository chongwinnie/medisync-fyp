-- MediSync / MedAgent initial Supabase schema
-- Auth0 is the identity provider (no password hashes stored here).
-- RLS intentionally not enabled in this migration per project request.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================
-- Enums
-- ============================
CREATE TYPE user_role AS ENUM ('admin', 'doctor', 'nurse', 'staff');

CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'unknown');
CREATE TYPE patient_status AS ENUM ('outpatient', 'admitted', 'discharged', 'inactive');
CREATE TYPE severity_level AS ENUM ('mild', 'moderate', 'severe', 'critical');
CREATE TYPE medication_status AS ENUM ('active', 'completed', 'stopped', 'paused');
CREATE TYPE visit_type AS ENUM ('consultation', 'follow_up', 'emergency', 'admission', 'discharge');
CREATE TYPE treatment_plan_status AS ENUM ('draft', 'active', 'completed', 'cancelled');
CREATE TYPE treatment_item_status AS ENUM ('pending', 'in_progress', 'done', 'skipped');

CREATE TYPE report_type AS ENUM ('lab', 'imaging', 'pathology', 'radiology', 'other');
CREATE TYPE report_status AS ENUM ('draft', 'pending_review', 'finalized', 'cancelled');

CREATE TYPE appointment_status AS ENUM ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE reminder_channel AS ENUM ('email', 'sms', 'in_app');
CREATE TYPE reminder_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');
CREATE TYPE queue_status AS ENUM ('waiting', 'called', 'in_consultation', 'done', 'skipped');

CREATE TYPE inventory_category AS ENUM ('medicine', 'supply', 'equipment', 'consumable', 'other');
CREATE TYPE inventory_status AS ENUM ('active', 'inactive', 'expired', 'recalled');
CREATE TYPE stock_transaction_type AS ENUM ('in', 'out', 'adjustment', 'return', 'expired');
CREATE TYPE alert_type AS ENUM ('low_stock', 'expiry', 'reorder', 'other');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');

CREATE TYPE room_type AS ENUM ('ward', 'icu', 'isolation', 'consultation', 'emergency');
CREATE TYPE room_status AS ENUM ('available', 'occupied', 'maintenance', 'closed');
CREATE TYPE theatre_status AS ENUM ('available', 'booked', 'maintenance', 'closed');
CREATE TYPE booking_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

CREATE TYPE shift_type AS ENUM ('morning', 'afternoon', 'night', 'on_call');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'leave', 'half_day');
CREATE TYPE payroll_status AS ENUM ('draft', 'processed', 'paid', 'cancelled');

CREATE TYPE notification_type AS ENUM ('system', 'appointment', 'inventory', 'clinical', 'staff');
CREATE TYPE chat_message_role AS ENUM ('user', 'assistant', 'system');

-- ============================
-- Shared trigger function
-- ============================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================
-- Identity and staff
-- ============================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  staff_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  department TEXT,
  specialization TEXT,
  phone TEXT,
  hire_date DATE,
  base_salary NUMERIC(12,2),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Facility and inventory roots
-- ============================
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number TEXT NOT NULL,
  ward TEXT,
  room_type room_type NOT NULL,
  bed_count INTEGER NOT NULL DEFAULT 1 CHECK (bed_count >= 0),
  status room_status NOT NULL DEFAULT 'available',
  special_equipment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_number, ward)
);

CREATE TABLE theatres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theatre_name TEXT NOT NULL UNIQUE,
  location TEXT,
  status theatre_status NOT NULL DEFAULT 'available',
  equipment_list TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  category inventory_category NOT NULL,
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_level INTEGER NOT NULL DEFAULT 0 CHECK (minimum_level >= 0),
  reorder_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reorder_quantity >= 0),
  unit TEXT NOT NULL,
  supplier_name TEXT,
  expiry_date DATE,
  unit_cost NUMERIC(12,2),
  status inventory_status NOT NULL DEFAULT 'active',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Patients and clinical core
-- ============================
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender gender_type NOT NULL,
  blood_type TEXT,
  phone TEXT,
  emergency_contact JSONB,
  allergies TEXT,
  primary_doctor_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  status patient_status NOT NULL DEFAULT 'outpatient',
  admitted_at TIMESTAMPTZ,
  discharged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patient_vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recorded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  heart_rate NUMERIC(6,2),
  blood_pressure_sys NUMERIC(6,2),
  blood_pressure_dia NUMERIC(6,2),
  temperature NUMERIC(5,2),
  o2_saturation NUMERIC(5,2),
  weight_kg NUMERIC(6,2),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE patient_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  icd_code TEXT,
  condition_name TEXT NOT NULL,
  severity severity_level,
  onset_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  diagnosed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  prescribed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  drug_name TEXT NOT NULL,
  dosage TEXT NOT NULL,
  frequency TEXT NOT NULL,
  route TEXT,
  start_date DATE,
  end_date DATE,
  status medication_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE case_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  visit_type visit_type NOT NULL,
  chief_complaint TEXT,
  clinical_notes TEXT,
  assessment TEXT,
  plan TEXT,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  visit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  objectives TEXT,
  status treatment_plan_status NOT NULL DEFAULT 'draft',
  ai_assisted BOOLEAN NOT NULL DEFAULT false,
  ai_draft_content TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE treatment_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  intervention TEXT NOT NULL,
  frequency TEXT,
  responsible_role user_role,
  status treatment_item_status NOT NULL DEFAULT 'pending',
  sequence_order INTEGER NOT NULL DEFAULT 1 CHECK (sequence_order > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ordered_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  test_name TEXT NOT NULL,
  result_value TEXT NOT NULL,
  unit TEXT,
  reference_range TEXT,
  is_abnormal BOOLEAN,
  status report_status NOT NULL DEFAULT 'draft',
  collected_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Diagnostics
-- ============================
CREATE TABLE diagnostic_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  finalized_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  report_type report_type NOT NULL,
  title TEXT NOT NULL,
  findings TEXT,
  ai_summary TEXT,
  ai_confidence NUMERIC(5,4),
  status report_status NOT NULL DEFAULT 'draft',
  ai_assisted BOOLEAN NOT NULL DEFAULT false,
  report_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diagnostic_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES diagnostic_reports(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  ai_interpretation TEXT,
  ai_confidence NUMERIC(5,4),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Appointments
-- ============================
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  booked_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  visit_type visit_type NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  status appointment_status NOT NULL DEFAULT 'scheduled',
  conflict_detected BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  google_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE TABLE appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  channel reminder_channel NOT NULL,
  status reminder_status NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appointment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  queue_number INTEGER NOT NULL CHECK (queue_number > 0),
  status queue_status NOT NULL DEFAULT 'waiting',
  checked_in_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Inventory and resources
-- ============================
CREATE TABLE stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  performed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  transaction_type stock_transaction_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason TEXT,
  reference_number TEXT,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  alert_type alert_type NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  dismissed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE bed_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  allocated_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  bed_number INTEGER NOT NULL CHECK (bed_number > 0),
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_discharge DATE,
  special_requirements TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE theatre_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theatre_id UUID NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lead_surgeon_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  booked_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  procedure_name TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status booking_status NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

-- ============================
-- Staff management module
-- ============================
CREATE TABLE shift_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  shift_type shift_type NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  conflict_flagged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  shift_schedule_id UUID REFERENCES shift_schedules(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL,
  clock_in TIME,
  clock_out TIME,
  hours_worked NUMERIC(6,2),
  overtime_hours NUMERIC(6,2),
  status attendance_status NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, attendance_date)
);

CREATE TABLE payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  processed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  pay_month INTEGER NOT NULL CHECK (pay_month BETWEEN 1 AND 12),
  pay_year INTEGER NOT NULL CHECK (pay_year >= 2000),
  days_worked INTEGER NOT NULL DEFAULT 0 CHECK (days_worked >= 0),
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  overtime_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  status payroll_status NOT NULL DEFAULT 'draft',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, pay_month, pay_year)
);

-- ============================
-- Product-level support tables
-- ============================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  supervisor_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role chat_message_role NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  supervisor_session_id TEXT,
  user_input TEXT,
  agent_output TEXT,
  entity_type TEXT,
  entity_id UUID,
  confidence_score NUMERIC(5,4),
  tokens_used INTEGER,
  response_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================
-- Business logic trigger (inventory stock)
-- ============================
CREATE OR REPLACE FUNCTION apply_stock_transaction()
RETURNS TRIGGER AS $$
DECLARE
  delta INTEGER;
  new_stock INTEGER;
BEGIN
  IF NEW.transaction_type = 'in' OR NEW.transaction_type = 'return' THEN
    delta := NEW.quantity;
  ELSIF NEW.transaction_type = 'out' OR NEW.transaction_type = 'expired' THEN
    delta := -NEW.quantity;
  ELSE
    -- adjustment: positive quantity means add stock; this keeps API simple.
    delta := NEW.quantity;
  END IF;

  UPDATE inventory_items
  SET current_stock = current_stock + delta,
      last_updated = now(),
      updated_at = now()
  WHERE id = NEW.item_id
  RETURNING current_stock INTO new_stock;

  IF new_stock < 0 THEN
    RAISE EXCEPTION 'Stock cannot go below zero for item %', NEW.item_id;
  END IF;

  INSERT INTO inventory_alerts (item_id, alert_type, severity, message)
  SELECT i.id, 'low_stock', 'warning', 'Stock below minimum level'
  FROM inventory_items i
  WHERE i.id = NEW.item_id
    AND i.current_stock <= i.minimum_level;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_stock_transaction
AFTER INSERT ON stock_transactions
FOR EACH ROW
EXECUTE FUNCTION apply_stock_transaction();

-- ============================
-- Updated-at triggers
-- ============================
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_theatres_updated_at BEFORE UPDATE ON theatres FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inventory_items_updated_at BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_patients_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_patient_conditions_updated_at BEFORE UPDATE ON patient_conditions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_medications_updated_at BEFORE UPDATE ON medications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_case_history_updated_at BEFORE UPDATE ON case_history FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_treatment_plans_updated_at BEFORE UPDATE ON treatment_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_treatment_plan_items_updated_at BEFORE UPDATE ON treatment_plan_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lab_results_updated_at BEFORE UPDATE ON lab_results FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_diagnostic_reports_updated_at BEFORE UPDATE ON diagnostic_reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_appointment_reminders_updated_at BEFORE UPDATE ON appointment_reminders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_appointment_queue_updated_at BEFORE UPDATE ON appointment_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inventory_alerts_updated_at BEFORE UPDATE ON inventory_alerts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bed_allocations_updated_at BEFORE UPDATE ON bed_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_theatre_bookings_updated_at BEFORE UPDATE ON theatre_bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_shift_schedules_updated_at BEFORE UPDATE ON shift_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_payroll_records_updated_at BEFORE UPDATE ON payroll_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================
-- Indexes
-- ============================
CREATE INDEX idx_users_auth0_sub ON users(auth0_sub);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_staff_user_id ON staff(user_id);

CREATE INDEX idx_patients_primary_doctor ON patients(primary_doctor_id);
CREATE INDEX idx_patients_status ON patients(status);
CREATE INDEX idx_patient_vitals_patient_time ON patient_vitals(patient_id, recorded_at DESC);
CREATE INDEX idx_conditions_patient_active ON patient_conditions(patient_id, is_active);
CREATE INDEX idx_medications_patient_status ON medications(patient_id, status);
CREATE INDEX idx_case_history_patient_time ON case_history(patient_id, visit_date DESC);
CREATE INDEX idx_treatment_plans_patient_status ON treatment_plans(patient_id, status);
CREATE INDEX idx_lab_results_patient_time ON lab_results(patient_id, collected_at DESC);

CREATE INDEX idx_diagnostic_reports_patient_date ON diagnostic_reports(patient_id, report_date DESC);
CREATE INDEX idx_diagnostic_images_report ON diagnostic_images(report_id);

CREATE INDEX idx_appointments_staff_time ON appointments(staff_id, start_time);
CREATE INDEX idx_appointments_patient_time ON appointments(patient_id, start_time);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointment_reminders_appt ON appointment_reminders(appointment_id);

CREATE INDEX idx_stock_transactions_item_time ON stock_transactions(item_id, transaction_date DESC);
CREATE INDEX idx_inventory_alerts_item_active ON inventory_alerts(item_id, is_dismissed);
CREATE INDEX idx_bed_allocations_patient_active ON bed_allocations(patient_id, is_active);
CREATE INDEX idx_theatre_bookings_theatre_time ON theatre_bookings(theatre_id, start_time);

CREATE INDEX idx_shift_schedules_staff_date ON shift_schedules(staff_id, shift_date);
CREATE INDEX idx_payroll_staff_period ON payroll_records(staff_id, pay_year, pay_month);

CREATE INDEX idx_notifications_user_read_time ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_chat_sessions_user_time ON chat_sessions(user_id, created_at DESC);
CREATE INDEX idx_chat_messages_session_time ON chat_messages(session_id, created_at);
CREATE INDEX idx_ai_logs_session ON ai_agent_logs(supervisor_session_id);
CREATE INDEX idx_audit_logs_user_time ON audit_logs(user_id, created_at DESC);

-- Partial unique indexes for active allocations
CREATE UNIQUE INDEX ux_room_bed_active ON bed_allocations(room_id, bed_number) WHERE is_active = true;
CREATE UNIQUE INDEX ux_patient_active_bed ON bed_allocations(patient_id) WHERE is_active = true;
