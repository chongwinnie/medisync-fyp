-- Patient email + staff working-hours preferences + staff leaves.
-- Enables the Appointment Scheduling agent to (a) read a patient's email to send
-- confirmations and (b) respect doctor preferences (recurring preferred working
-- hours + approved leaves) when booking from a patient email message.
--
-- Applied to the shared hosted Supabase Postgres (single source of truth for both
-- the Next.js frontend and the AI backend). Idempotent: safe to re-run.

-- 1) patients had no email column at all — add it (nullable; populated by seed below).
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email text;

-- 2) staff recurring preferred working hours ("doctor preferences").
CREATE TABLE IF NOT EXISTS staff_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    preferred_start_time time NOT NULL,
    preferred_end_time time NOT NULL,
    working_days int[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- Mon=1 .. Sun=7
    time_zone text NOT NULL DEFAULT 'Asia/Singapore',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (staff_id)
);

-- 3) staff leaves (approved time off the agent must avoid when booking).
CREATE TABLE IF NOT EXISTS staff_leaves (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    start_date date NOT NULL,
    end_date date NOT NULL,
    leave_type text NOT NULL DEFAULT 'annual',
    reason text,
    status text NOT NULL DEFAULT 'approved',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date),
    UNIQUE (staff_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_leaves_staff_dates
    ON staff_leaves(staff_id, start_date, end_date);

-- Seed: doctor/admin/nurse mail redirected to one inbox via Gmail plus-addressing.
-- users.email is UNIQUE, so the +tag keeps rows distinct while every message still
-- lands in zhijiandev23@gmail.com (Gmail ignores the +suffix on delivery).
UPDATE users SET email = 'zhijiandev23+doctor@gmail.com'
    WHERE id = '11111111-1111-1111-1111-111111111002';  -- Dr. Sarah Chen
UPDATE users SET email = 'zhijiandev23+admin@gmail.com'
    WHERE id = '11111111-1111-1111-1111-111111111001';  -- Admin James Wong
UPDATE users SET email = 'zhijiandev23+nurse@gmail.com'
    WHERE id = '11111111-1111-1111-1111-111111111003';  -- Nurse Mei Ling

-- Seed patient emails (two test patients for appointment confirmations).
UPDATE patients SET email = 'ruj8320@gmail.com'
    WHERE id = '33333333-3333-3333-3333-333333333001';  -- Lim Wei Ming
UPDATE patients SET email = 'zjsam1880@gmail.com'
    WHERE id = '33333333-3333-3333-3333-333333333002';  -- Tan Mei Lin

-- Seed Dr. Sarah Chen's preferred working hours: Mon-Fri 09:00-17:00 SGT.
INSERT INTO staff_preferences (staff_id, preferred_start_time, preferred_end_time,
                                working_days, time_zone, notes)
VALUES ('22222222-2222-2222-2222-222222222002', '09:00', '17:00',
        '{1,2,3,4,5}', 'Asia/Singapore', 'Default clinic hours')
ON CONFLICT (staff_id) DO UPDATE SET
    preferred_start_time = EXCLUDED.preferred_start_time,
    preferred_end_time = EXCLUDED.preferred_end_time,
    working_days = EXCLUDED.working_days,
    time_zone = EXCLUDED.time_zone,
    notes = EXCLUDED.notes,
    updated_at = now();

-- Seed one approved leave day for Dr. Sarah so the agent has something to avoid.
INSERT INTO staff_leaves (staff_id, start_date, end_date, leave_type, reason, status)
VALUES ('22222222-2222-2222-2222-222222222002',
        DATE '2026-07-20', DATE '2026-07-20', 'annual', 'Personal', 'approved')
ON CONFLICT (staff_id, start_date, end_date) DO NOTHING;
