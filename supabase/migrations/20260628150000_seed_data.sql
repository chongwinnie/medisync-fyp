-- MediSync development seed data
-- Placeholder auth0_sub values sync via sync_auth0_user on real Auth0 login.
-- Idempotent: ON CONFLICT DO NOTHING on natural keys / fixed UUIDs.

BEGIN;

-- ============================
-- 1. Users (3)
-- ============================
INSERT INTO users (id, auth0_sub, email, role, is_active, email_verified, last_login)
VALUES
  ('11111111-1111-1111-1111-111111111001'::uuid, 'auth0|seed-admin',  'admin@medisync.app',  'admin',  true, true, now() - interval '2 hours'),
  ('11111111-1111-1111-1111-111111111002'::uuid, 'auth0|seed-doctor', 'doctor@medisync.app', 'doctor', true, true, now() - interval '1 hour'),
  ('11111111-1111-1111-1111-111111111003'::uuid, 'auth0|seed-nurse',  'nurse@medisync.app',  'nurse',  true, true, now() - interval '30 minutes')
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 2. Staff (3)
-- ============================
INSERT INTO staff (id, user_id, staff_code, full_name, department, specialization, phone, hire_date, base_salary)
VALUES
  ('22222222-2222-2222-2222-222222222001'::uuid, '11111111-1111-1111-1111-111111111001'::uuid, 'STF-ADM-001', 'Admin James Wong',  'Human Resources', 'HR Administration', '+60-3-2141-8801', DATE '2022-03-15', 9200.00),
  ('22222222-2222-2222-2222-222222222002'::uuid, '11111111-1111-1111-1111-111111111002'::uuid, 'STF-DOC-001', 'Dr. Sarah Chen',    'Cardiology',      'Interventional Cardiology', '+60-3-2141-8802', DATE '2019-08-01', 18500.00),
  ('22222222-2222-2222-2222-222222222003'::uuid, '11111111-1111-1111-1111-111111111003'::uuid, 'STF-NUR-001', 'Nurse Mei Ling',    'General Ward',    'Ward Nursing', '+60-3-2141-8803', DATE '2021-01-10', 8200.00)
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 12. Rooms (8) — before patients/beds
-- ============================
INSERT INTO rooms (id, room_number, ward, room_type, bed_count, status, special_equipment)
VALUES
  ('44444444-4444-4444-4444-444444444001'::uuid, 'A-101', 'General Ward',  'ward',         2, 'occupied',    'Cardiac monitor, IV stand'),
  ('44444444-4444-4444-4444-444444444002'::uuid, 'A-102', 'General Ward',  'ward',         2, 'occupied',    'Pulse oximeter'),
  ('44444444-4444-4444-4444-444444444003'::uuid, 'A-103', 'General Ward',  'ward',         4, 'available',   NULL),
  ('44444444-4444-4444-4444-444444444004'::uuid, 'B-201', 'Cardiology',    'consultation', 1, 'available',   'ECG machine'),
  ('44444444-4444-4444-4444-444444444005'::uuid, 'ICU-01', 'Intensive Care', 'icu',         1, 'occupied',    'Ventilator, dialysis machine'),
  ('44444444-4444-4444-4444-444444444006'::uuid, 'ISO-01', 'Isolation',     'isolation',    1, 'available',   'Negative pressure'),
  ('44444444-4444-4444-4444-444444444007'::uuid, 'ER-01',  'Emergency',     'emergency',    4, 'available',   'Crash cart, defibrillator'),
  ('44444444-4444-4444-4444-444444444008'::uuid, 'B-202', 'Cardiology',    'consultation', 1, 'maintenance', 'ECG machine')
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 3. Patients (10)
-- ============================
INSERT INTO patients (
  id, patient_code, full_name, date_of_birth, gender, blood_type, phone,
  emergency_contact, allergies, primary_doctor_id, status, admitted_at, discharged_at
)
VALUES
  ('33333333-3333-3333-3333-333333333001'::uuid, 'PT-1042', 'Lim Wei Ming',   DATE '1965-04-12', 'male',   'O+',  '+60-12-345-6701', '{"name":"Lim Siew Lan","relationship":"spouse","phone":"+60-12-345-6702"}'::jsonb, 'Penicillin', '22222222-2222-2222-2222-222222222002'::uuid, 'admitted',   now() - interval '3 days', NULL),
  ('33333333-3333-3333-3333-333333333002'::uuid, 'PT-1043', 'Tan Mei Lin',    DATE '1988-09-23', 'female', 'A+',  '+60-12-345-6703', '{"name":"Tan Ah Beng","relationship":"father","phone":"+60-12-345-6704"}'::jsonb, NULL,         '22222222-2222-2222-2222-222222222002'::uuid, 'outpatient', NULL, NULL),
  ('33333333-3333-3333-3333-333333333003'::uuid, 'PT-1044', 'Kumar Rajesh',   DATE '1972-11-05', 'male',   'B+',  '+60-12-345-6705', '{"name":"Priya Kumar","relationship":"wife","phone":"+60-12-345-6706"}'::jsonb, 'Sulfa drugs', '22222222-2222-2222-2222-222222222002'::uuid, 'admitted',   now() - interval '5 days', NULL),
  ('33333333-3333-3333-3333-333333333004'::uuid, 'PT-1045', 'Wong Siew Hua',  DATE '1955-07-18', 'female', 'AB+', '+60-12-345-6707', '{"name":"Wong Kok Wai","relationship":"son","phone":"+60-12-345-6708"}'::jsonb, 'Aspirin',    '22222222-2222-2222-2222-222222222002'::uuid, 'discharged', now() - interval '14 days', now() - interval '2 days'),
  ('33333333-3333-3333-3333-333333333005'::uuid, 'PT-1046', 'Ng Ah Kow',      DATE '1940-01-30', 'male',   'A-',  '+60-12-345-6709', '{"name":"Ng Mei Fong","relationship":"daughter","phone":"+60-12-345-6710"}'::jsonb, NULL,         '22222222-2222-2222-2222-222222222002'::uuid, 'outpatient', NULL, NULL),
  ('33333333-3333-3333-3333-333333333006'::uuid, 'PT-1047', 'Lee Jia Hui',    DATE '1995-12-08', 'female', 'O-',  '+60-12-345-6711', '{"name":"Lee Wei Jie","relationship":"brother","phone":"+60-12-345-6712"}'::jsonb, 'Latex',      '22222222-2222-2222-2222-222222222002'::uuid, 'admitted',   now() - interval '1 day',  NULL),
  ('33333333-3333-3333-3333-333333333007'::uuid, 'PT-1048', 'Ahmad Zainal',   DATE '1980-06-14', 'male',   'B-',  '+60-12-345-6713', '{"name":"Siti Aminah","relationship":"wife","phone":"+60-12-345-6714"}'::jsonb, NULL,         '22222222-2222-2222-2222-222222222002'::uuid, 'outpatient', NULL, NULL),
  ('33333333-3333-3333-3333-333333333008'::uuid, 'PT-1049', 'Chua Bee Leng',  DATE '1978-03-22', 'female', 'A+',  '+60-12-345-6715', '{"name":"Chua Boon Huat","relationship":"husband","phone":"+60-12-345-6716"}'::jsonb, 'Ibuprofen',  '22222222-2222-2222-2222-222222222002'::uuid, 'discharged', now() - interval '10 days', now() - interval '4 days'),
  ('33333333-3333-3333-3333-333333333009'::uuid, 'PT-1050', 'Ho Pei Shan',    DATE '1992-10-01', 'female', 'O+',  '+60-12-345-6717', '{"name":"Ho Wei Ming","relationship":"brother","phone":"+60-12-345-6718"}'::jsonb, NULL,         '22222222-2222-2222-2222-222222222002'::uuid, 'outpatient', NULL, NULL),
  ('33333333-3333-3333-3333-333333333010'::uuid, 'PT-1051', 'Ibrahim Hassan', DATE '1960-08-27', 'male',   'AB-', '+60-12-345-6719', '{"name":"Fatimah Hassan","relationship":"wife","phone":"+60-12-345-6720"}'::jsonb, 'Codeine',    '22222222-2222-2222-2222-222222222002'::uuid, 'inactive',   NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 4. Patient vitals (2-3 per admitted patient)
-- ============================
INSERT INTO patient_vitals (id, patient_id, recorded_by, heart_rate, blood_pressure_sys, blood_pressure_dia, temperature, o2_saturation, weight_kg, recorded_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1001'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 78,  128, 82, 36.8, 97.0, 72.5, now() - interval '6 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1002'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 82,  132, 84, 37.0, 96.5, 72.5, now() - interval '2 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1003'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 76,  125, 80, 36.7, 97.5, 72.3, now() - interval '30 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1004'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 88,  145, 92, 37.2, 94.0, 81.0, now() - interval '4 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1005'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 85,  140, 88, 36.9, 95.0, 80.8, now() - interval '1 hour'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1006'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 84,  138, 86, 36.8, 95.5, 80.6, now() - interval '20 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1007'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 92,  118, 74, 38.4, 93.0, 58.2, now() - interval '3 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1008'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 90,  115, 72, 38.1, 94.5, 58.0, now() - interval '45 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa1009'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 88,  112, 70, 37.8, 95.0, 57.8, now() - interval '10 minutes')
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 5. Patient conditions (1-2 per patient)
-- ============================
INSERT INTO patient_conditions (id, patient_id, icd_code, condition_name, severity, onset_date, is_active, diagnosed_by)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1001'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, 'I25.10', 'Coronary artery disease', 'moderate', DATE '2020-03-01', true,  '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1002'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, 'E11.9',  'Type 2 diabetes mellitus', 'mild', DATE '2018-06-15', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1003'::uuid, '33333333-3333-3333-3333-333333333002'::uuid, 'J06.9',  'Upper respiratory infection', 'mild', DATE '2026-06-20', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1004'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, 'I50.9',  'Heart failure', 'severe', DATE '2024-01-10', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1005'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, 'I10',    'Essential hypertension', 'moderate', DATE '2015-09-01', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1006'::uuid, '33333333-3333-3333-3333-333333333004'::uuid, 'S72.001A', 'Femur fracture', 'moderate', DATE '2026-06-14', false, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1007'::uuid, '33333333-3333-3333-3333-333333333005'::uuid, 'N18.3',  'Chronic kidney disease stage 3', 'moderate', DATE '2019-11-20', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1008'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, 'J18.9',  'Pneumonia', 'severe', DATE '2026-06-27', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1009'::uuid, '33333333-3333-3333-3333-333333333007'::uuid, 'M54.5',  'Low back pain', 'mild', DATE '2026-05-10', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1010'::uuid, '33333333-3333-3333-3333-333333333008'::uuid, 'K21.0',  'Gastroesophageal reflux', 'mild', DATE '2023-02-01', false, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1011'::uuid, '33333333-3333-3333-3333-333333333009'::uuid, 'F41.1',  'Generalized anxiety disorder', 'mild', DATE '2024-08-05', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1012'::uuid, '33333333-3333-3333-3333-333333333010'::uuid, 'C34.90', 'Lung cancer', 'critical', DATE '2025-12-01', true, '22222222-2222-2222-2222-222222222002'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb1013'::uuid, '33333333-3333-3333-3333-333333333010'::uuid, 'J44.9',  'COPD', 'moderate', DATE '2010-04-12', true, '22222222-2222-2222-2222-222222222002'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 6. Medications (active for selected patients)
-- ============================
INSERT INTO medications (id, patient_id, prescribed_by, drug_name, dosage, frequency, route, start_date, end_date, status, notes)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccc1001'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'Atorvastatin',  '20mg',  'Once daily',   'oral', DATE '2020-03-05', NULL, 'active', 'Take at bedtime'),
  ('cccccccc-cccc-cccc-cccc-cccccccc1002'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'Metformin',     '500mg', 'Twice daily',  'oral', DATE '2018-06-20', NULL, 'active', NULL),
  ('cccccccc-cccc-cccc-cccc-cccccccc1003'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'Furosemide',    '40mg',  'Once daily',   'oral', DATE '2024-01-15', NULL, 'active', 'Monitor electrolytes'),
  ('cccccccc-cccc-cccc-cccc-cccccccc1004'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'Carvedilol',    '6.25mg','Twice daily',  'oral', DATE '2024-01-15', NULL, 'active', NULL),
  ('cccccccc-cccc-cccc-cccc-cccccccc1005'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'Amoxicillin',   '500mg', 'Three times daily', 'oral', DATE '2026-06-27', DATE '2026-07-04', 'active', 'Complete full course'),
  ('cccccccc-cccc-cccc-cccc-cccccccc1006'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'Paracetamol',   '1g',    'Every 6 hours PRN', 'oral', DATE '2026-06-27', NULL, 'active', 'For fever'),
  ('cccccccc-cccc-cccc-cccc-cccccccc1007'::uuid, '33333333-3333-3333-3333-333333333005'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'Calcium carbonate', '500mg', 'Twice daily', 'oral', DATE '2019-12-01', NULL, 'active', NULL),
  ('cccccccc-cccc-cccc-cccc-cccccccc1008'::uuid, '33333333-3333-3333-3333-333333333002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'Loratadine',    '10mg',  'Once daily',   'oral', DATE '2026-06-20', DATE '2026-06-30', 'active', 'For allergic rhinitis')
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 10. Inventory items (12, some below minimum)
-- ============================
INSERT INTO inventory_items (id, sku, item_name, category, current_stock, minimum_level, reorder_quantity, unit, supplier_name, expiry_date, unit_cost, status)
VALUES
  ('55555555-5555-5555-5555-555555555001'::uuid, 'MED-ATV-020', 'Atorvastatin 20mg',       'medicine',    450, 100, 500,  'tablet',  'PharmaCare MY',  DATE '2027-06-01', 0.85,  'active'),
  ('55555555-5555-5555-5555-555555555002'::uuid, 'MED-MET-500', 'Metformin 500mg',         'medicine',    380, 150, 600,  'tablet',  'PharmaCare MY',  DATE '2027-03-15', 0.42,  'active'),
  ('55555555-5555-5555-5555-555555555003'::uuid, 'MED-AMX-500', 'Amoxicillin 500mg',       'medicine',     45, 100, 300,  'capsule', 'MedSupply KL',   DATE '2026-12-01', 1.20,  'active'),
  ('55555555-5555-5555-5555-555555555004'::uuid, 'MED-FUR-040', 'Furosemide 40mg',         'medicine',     28,  50, 200,  'tablet',  'PharmaCare MY',  DATE '2027-01-20', 0.65,  'active'),
  ('55555555-5555-5555-5555-555555555005'::uuid, 'SUP-GLO-100', 'Nitrile Gloves (M)',      'supply',      850, 300, 2000, 'pair',    'MedSupply KL',   NULL,             0.15,  'active'),
  ('55555555-5555-5555-5555-555555555006'::uuid, 'SUP-SYR-10',  'Syringe 10ml',            'consumable',  120, 200, 1000, 'unit',    'MedSupply KL',   NULL,             0.35,  'active'),
  ('55555555-5555-5555-5555-555555555007'::uuid, 'SUP-MASK-N95','N95 Respirator Mask',     'supply',       18,  50, 500,  'unit',    'SafeGuard PPE',  NULL,             2.50,  'active'),
  ('55555555-5555-5555-5555-555555555008'::uuid, 'SUP-IVS-500', 'IV Saline 500ml',         'consumable',  210, 100, 500,  'bag',     'MedSupply KL',   DATE '2026-09-30', 3.80,  'active'),
  ('55555555-5555-5555-5555-555555555009'::uuid, 'EQP-OXI-001', 'Portable Pulse Oximeter', 'equipment',     8,   5,  10,  'unit',    'BioMed Devices', NULL,           180.00,  'active'),
  ('55555555-5555-5555-5555-555555555010'::uuid, 'MED-PCT-1G',  'Paracetamol 1g IV',       'medicine',     12,  30, 100,  'vial',    'PharmaCare MY',  DATE '2026-08-15', 4.50,  'active'),
  ('55555555-5555-5555-5555-555555555011'::uuid, 'SUP-BND-001', 'Elastic Bandage 10cm',    'supply',      340, 100, 400,  'roll',    'MedSupply KL',   NULL,             1.80,  'active'),
  ('55555555-5555-5555-5555-555555555012'::uuid, 'MED-HEP-5000','Heparin 5000 IU',         'medicine',      8,  20,  80,  'vial',    'PharmaCare MY',  DATE '2026-07-10', 12.00, 'active')
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 11. Inventory alerts (3 low_stock)
-- ============================
INSERT INTO inventory_alerts (id, item_id, alert_type, severity, message, is_dismissed, triggered_at)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddd1001'::uuid, '55555555-5555-5555-5555-555555555003'::uuid, 'low_stock', 'warning',  'Stock below minimum level (45/100)', false, now() - interval '2 days'),
  ('dddddddd-dddd-dddd-dddd-dddddddd1002'::uuid, '55555555-5555-5555-5555-555555555007'::uuid, 'low_stock', 'critical', 'Stock below minimum level (18/50)',  false, now() - interval '1 day'),
  ('dddddddd-dddd-dddd-dddd-dddddddd1003'::uuid, '55555555-5555-5555-5555-555555555012'::uuid, 'low_stock', 'critical', 'Stock below minimum level (8/20)',   false, now() - interval '6 hours')
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 7. Appointments (10, today + this week)
-- ============================
INSERT INTO appointments (
  id, patient_id, staff_id, booked_by, room_id, visit_type,
  start_time, end_time, duration_minutes, status, conflict_detected, notes
)
VALUES
  ('66666666-6666-6666-6666-666666666001'::uuid, '33333333-3333-3333-3333-333333333002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '44444444-4444-4444-4444-444444444004'::uuid, 'consultation', (CURRENT_DATE + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + time '09:30') AT TIME ZONE 'Asia/Kuala_Lumpur', 30, 'confirmed',    false, 'Follow-up for URI'),
  ('66666666-6666-6666-6666-666666666002'::uuid, '33333333-3333-3333-3333-333333333005'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '44444444-4444-4444-4444-444444444004'::uuid, 'follow_up',    (CURRENT_DATE + time '10:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + time '10:30') AT TIME ZONE 'Asia/Kuala_Lumpur', 30, 'in_progress',  false, 'CKD review'),
  ('66666666-6666-6666-6666-666666666003'::uuid, '33333333-3333-3333-3333-333333333007'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '44444444-4444-4444-4444-444444444004'::uuid, 'consultation', (CURRENT_DATE + time '11:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + time '11:45') AT TIME ZONE 'Asia/Kuala_Lumpur', 45, 'scheduled',    false, 'Back pain assessment'),
  ('66666666-6666-6666-6666-666666666004'::uuid, '33333333-3333-3333-3333-333333333009'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '44444444-4444-4444-4444-444444444004'::uuid, 'follow_up',    (CURRENT_DATE + time '14:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + time '14:30') AT TIME ZONE 'Asia/Kuala_Lumpur', 30, 'scheduled',    false, 'Anxiety follow-up'),
  ('66666666-6666-6666-6666-666666666005'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, '44444444-4444-4444-4444-444444444001'::uuid, 'follow_up',    (CURRENT_DATE + time '15:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + time '15:30') AT TIME ZONE 'Asia/Kuala_Lumpur', 30, 'scheduled',    false, 'Ward round — CAD'),
  ('66666666-6666-6666-6666-666666666006'::uuid, '33333333-3333-3333-3333-333333333008'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '44444444-4444-4444-4444-444444444004'::uuid, 'discharge',    (CURRENT_DATE + interval '1 day' + time '09:30') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + interval '1 day' + time '10:00') AT TIME ZONE 'Asia/Kuala_Lumpur', 30, 'scheduled', false, 'Post-discharge review'),
  ('66666666-6666-6666-6666-666666666007'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, '44444444-4444-4444-4444-444444444002'::uuid, 'follow_up',    (CURRENT_DATE + interval '2 days' + time '11:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + interval '2 days' + time '11:30') AT TIME ZONE 'Asia/Kuala_Lumpur', 30, 'confirmed', false, 'Heart failure monitoring'),
  ('66666666-6666-6666-6666-666666666008'::uuid, '33333333-3333-3333-3333-333333333004'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '44444444-4444-4444-4444-444444444004'::uuid, 'follow_up',    (CURRENT_DATE - interval '1 day' + time '10:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE - interval '1 day' + time '10:30') AT TIME ZONE 'Asia/Kuala_Lumpur', 30, 'completed', false, 'Fracture follow-up'),
  ('66666666-6666-6666-6666-666666666009'::uuid, '33333333-3333-3333-3333-333333333010'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '44444444-4444-4444-4444-444444444004'::uuid, 'consultation', (CURRENT_DATE + interval '3 days' + time '14:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + interval '3 days' + time '15:00') AT TIME ZONE 'Asia/Kuala_Lumpur', 60, 'scheduled', false, 'Oncology review'),
  ('66666666-6666-6666-6666-666666666010'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, '44444444-4444-4444-4444-444444444005'::uuid, 'follow_up',    (CURRENT_DATE + time '16:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (CURRENT_DATE + time '16:30') AT TIME ZONE 'Asia/Kuala_Lumpur', 30, 'scheduled', false, 'ICU pneumonia review')
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 8. Appointment queue (4 for today)
-- ============================
INSERT INTO appointment_queue (id, appointment_id, queue_number, status, checked_in_at, called_at)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee1001'::uuid, '66666666-6666-6666-6666-666666666001'::uuid, 1, 'done',             now() - interval '3 hours', now() - interval '2 hours 45 minutes'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee1002'::uuid, '66666666-6666-6666-6666-666666666002'::uuid, 2, 'in_consultation',  now() - interval '45 minutes', now() - interval '30 minutes'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee1003'::uuid, '66666666-6666-6666-6666-666666666003'::uuid, 3, 'waiting',          now() - interval '15 minutes', NULL),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeee1004'::uuid, '66666666-6666-6666-6666-666666666004'::uuid, 4, 'waiting',          NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 9. Diagnostic reports (8)
-- ============================
INSERT INTO diagnostic_reports (
  id, patient_id, requested_by, finalized_by, report_type, title, findings,
  ai_summary, ai_confidence, status, ai_assisted, report_date, finalized_at
)
VALUES
  ('77777777-7777-7777-7777-777777777001'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'lab',      'Lipid Panel',           'Total cholesterol 5.8 mmol/L, LDL 3.6 mmol/L', 'Elevated LDL; statin therapy recommended', 0.9100, 'finalized',      true,  now() - interval '5 days', now() - interval '4 days'),
  ('77777777-7777-7777-7777-777777777002'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, NULL,                                         'lab',      'BNP Level',             'BNP 680 pg/mL (elevated)',                     'Elevated BNP consistent with heart failure decompensation', 0.8800, 'pending_review', true,  now() - interval '2 days', NULL),
  ('77777777-7777-7777-7777-777777777003'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'imaging',  'Chest X-Ray PA',        'Right lower lobe consolidation',               'Findings suggest community-acquired pneumonia', 0.9300, 'finalized',      true,  now() - interval '1 day',  now() - interval '20 hours'),
  ('77777777-7777-7777-7777-777777777004'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, NULL,                                         'lab',      'Full Blood Count',      'WBC 14.2 x10^9/L, CRP 85 mg/L',                'Leukocytosis with elevated CRP; infection likely', 0.8700, 'draft',          false, now() - interval '18 hours', NULL),
  ('77777777-7777-7777-7777-777777777005'::uuid, '33333333-3333-3333-3333-333333333004'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'imaging',  'Hip X-Ray',             'Intertrochanteric fracture of left femur',     'Fracture confirmed; surgical fixation performed', 0.9500, 'finalized',      false, now() - interval '14 days', now() - interval '13 days'),
  ('77777777-7777-7777-7777-777777777006'::uuid, '33333333-3333-3333-3333-333333333005'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, NULL,                                         'lab',      'Renal Function Panel',  'eGFR 42 mL/min/1.73m², Creatinine 1.6 mg/dL', 'Stage 3 CKD; monitor renal function quarterly', 0.8500, 'pending_review', true,  now() - interval '7 days', NULL),
  ('77777777-7777-7777-7777-777777777007'::uuid, '33333333-3333-3333-3333-333333333010'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, 'radiology', 'CT Chest with Contrast', '3.2 cm mass in right upper lobe',              'Suspicious pulmonary mass; biopsy recommended', 0.9200, 'finalized',      true,  now() - interval '30 days', now() - interval '28 days'),
  ('77777777-7777-7777-7777-777777777008'::uuid, '33333333-3333-3333-3333-333333333002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, NULL,                                         'lab',      'Throat Swab Culture',   'Pending',                                      NULL, NULL, 'draft', false, now() - interval '3 hours', NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 12b. Bed allocations (3 active)
-- ============================
INSERT INTO bed_allocations (id, room_id, patient_id, allocated_by, bed_number, admission_date, expected_discharge, special_requirements, is_active)
VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffff1001'::uuid, '44444444-4444-4444-4444-444444444001'::uuid, '33333333-3333-3333-3333-333333333001'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 1, CURRENT_DATE - 3, CURRENT_DATE + 4, 'Cardiac monitoring', true),
  ('ffffffff-ffff-ffff-ffff-ffffffff1002'::uuid, '44444444-4444-4444-4444-444444444002'::uuid, '33333333-3333-3333-3333-333333333003'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 1, CURRENT_DATE - 5, CURRENT_DATE + 7, 'Fluid restriction',  true),
  ('ffffffff-ffff-ffff-ffff-ffffffff1003'::uuid, '44444444-4444-4444-4444-444444444005'::uuid, '33333333-3333-3333-3333-333333333006'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, 1, CURRENT_DATE - 1, CURRENT_DATE + 5, 'Oxygen therapy',     true)
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 13. Shift schedules (8, current week)
-- ============================
INSERT INTO shift_schedules (id, staff_id, created_by, shift_date, start_time, end_time, location, shift_type, is_published, conflict_flagged)
VALUES
  ('99999999-9999-9999-9999-999999999001'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, date_trunc('week', CURRENT_DATE)::date,     '08:00', '16:00', 'Cardiology Clinic B-201', 'morning',   true, false),
  ('99999999-9999-9999-9999-999999999002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, date_trunc('week', CURRENT_DATE)::date + 1, '08:00', '16:00', 'Cardiology Ward',         'morning',   true, false),
  ('99999999-9999-9999-9999-999999999003'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, date_trunc('week', CURRENT_DATE)::date + 2, '08:00', '16:00', 'Cardiology Clinic B-201', 'morning',   true, false),
  ('99999999-9999-9999-9999-999999999004'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, date_trunc('week', CURRENT_DATE)::date,     '07:00', '15:00', 'General Ward A',          'morning',   true, false),
  ('99999999-9999-9999-9999-999999999005'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, date_trunc('week', CURRENT_DATE)::date + 1, '15:00', '23:00', 'General Ward A',          'afternoon', true, false),
  ('99999999-9999-9999-9999-999999999006'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, date_trunc('week', CURRENT_DATE)::date + 3, '07:00', '15:00', 'ICU',                     'morning',   true, false),
  ('99999999-9999-9999-9999-999999999007'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, date_trunc('week', CURRENT_DATE)::date + 4, '09:00', '17:00', 'Admin Office',            'morning',   true, false),
  ('99999999-9999-9999-9999-999999999008'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, date_trunc('week', CURRENT_DATE)::date + 4, '08:00', '16:00', 'Cardiology Clinic B-201', 'morning',   true, true)
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 14. Attendance records (last 7 days, 3 staff)
-- ============================
INSERT INTO attendance_records (id, staff_id, attendance_date, clock_in, clock_out, hours_worked, overtime_hours, status)
VALUES
  ('10101010-1010-1010-1010-000000000001'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, CURRENT_DATE - 6, '08:05', '16:30', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000002'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, CURRENT_DATE - 5, '08:00', '16:30', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000003'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, CURRENT_DATE - 4, '08:10', '17:00', 8.0, 0.5, 'present'),
  ('10101010-1010-1010-1010-000000000004'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, CURRENT_DATE - 3, '08:00', '16:30', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000005'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, CURRENT_DATE - 2, '08:00', '16:30', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000006'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, CURRENT_DATE - 1, '08:00', '16:30', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000007'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, CURRENT_DATE,     '08:00', NULL,    NULL,  NULL, (CASE WHEN EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN 'leave' ELSE 'present' END)::attendance_status),
  ('10101010-1010-1010-1010-000000000008'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, CURRENT_DATE - 6, '07:55', '15:30', 7.5, 0,   'present'),
  ('10101010-1010-1010-1010-000000000009'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, CURRENT_DATE - 5, '07:50', '15:30', 7.5, 0,   'present'),
  ('10101010-1010-1010-1010-000000000010'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, CURRENT_DATE - 4, '08:20', '15:30', 7.5, 0,   'late'),
  ('10101010-1010-1010-1010-000000000011'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, CURRENT_DATE - 3, '07:55', '16:00', 8.0, 0.5, 'present'),
  ('10101010-1010-1010-1010-000000000012'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, CURRENT_DATE - 2, '07:55', '15:30', 7.5, 0,   'present'),
  ('10101010-1010-1010-1010-000000000013'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, CURRENT_DATE - 1, '07:55', '15:30', 7.5, 0,   'present'),
  ('10101010-1010-1010-1010-000000000014'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, CURRENT_DATE,     '07:55', NULL,    NULL,  NULL, (CASE WHEN EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN 'leave' ELSE 'present' END)::attendance_status),
  ('10101010-1010-1010-1010-000000000015'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, CURRENT_DATE - 6, '09:00', '17:00', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000016'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, CURRENT_DATE - 5, '09:00', '17:00', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000017'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, CURRENT_DATE - 4, '09:00', '17:00', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000018'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, CURRENT_DATE - 3, '09:00', '17:00', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000019'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, CURRENT_DATE - 2, '09:00', '17:00', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000020'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, CURRENT_DATE - 1, '09:00', '17:00', 8.0, 0,   'present'),
  ('10101010-1010-1010-1010-000000000021'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, CURRENT_DATE,     NULL,    NULL,    NULL,  NULL, (CASE WHEN EXTRACT(DOW FROM CURRENT_DATE) = 0 THEN 'leave' ELSE 'present' END)::attendance_status)
ON CONFLICT (staff_id, attendance_date) DO NOTHING;

-- ============================
-- 15. Payroll records (current month, 3 staff)
-- ============================
INSERT INTO payroll_records (
  id, staff_id, processed_by, pay_month, pay_year, days_worked,
  base_salary, overtime_pay, deductions, net_pay, status, processed_at
)
VALUES
  ('12121212-1212-1212-1212-000000000001'::uuid, '22222222-2222-2222-2222-222222222002'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int, 22, 18500.00, 450.00, 2100.00, 16850.00, 'processed', now() - interval '5 days'),
  ('12121212-1212-1212-1212-000000000002'::uuid, '22222222-2222-2222-2222-222222222003'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int, 22, 8200.00,  180.00, 820.00,  7560.00,  'processed', now() - interval '5 days'),
  ('12121212-1212-1212-1212-000000000003'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, '22222222-2222-2222-2222-222222222001'::uuid, EXTRACT(MONTH FROM CURRENT_DATE)::int, EXTRACT(YEAR FROM CURRENT_DATE)::int, 22, 9200.00,  0.00,   920.00,  8280.00,  'draft',     NULL)
ON CONFLICT (staff_id, pay_month, pay_year) DO NOTHING;

-- ============================
-- 16. Notifications (10)
-- ============================
INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id, is_read, read_at, created_at)
VALUES
  ('13131313-1313-1313-1313-000000000001'::uuid, '11111111-1111-1111-1111-111111111002'::uuid, 'clinical',    'Critical BNP Result',        'Patient Kumar Rajesh — BNP 680 pg/mL requires review.', 'diagnostic_report', '77777777-7777-7777-7777-777777777002'::uuid, false, NULL, now() - interval '2 hours'),
  ('13131313-1313-1313-1313-000000000002'::uuid, '11111111-1111-1111-1111-111111111003'::uuid, 'clinical',    'Vitals Alert — Lee Jia Hui', 'SpO₂ 93% recorded in ICU. Please assess.',            'patient',           '33333333-3333-3333-3333-333333333006'::uuid, false, NULL, now() - interval '3 hours'),
  ('13131313-1313-1313-1313-000000000003'::uuid, '11111111-1111-1111-1111-111111111001'::uuid, 'inventory',   'Low Stock: N95 Masks',       'Only 18 units remaining (min 50). Reorder required.',   'inventory_item',    '55555555-5555-5555-5555-555555555007'::uuid, true,  now() - interval '1 day', now() - interval '2 days'),
  ('13131313-1313-1313-1313-000000000004'::uuid, '11111111-1111-1111-1111-111111111002'::uuid, 'appointment', 'Upcoming: Tan Mei Lin',      'Consultation today at 09:00 in Cardiology B-201.',      'appointment',       '66666666-6666-6666-6666-666666666001'::uuid, true,  now() - interval '4 hours', now() - interval '5 hours'),
  ('13131313-1313-1313-1313-000000000005'::uuid, '11111111-1111-1111-1111-111111111003'::uuid, 'appointment', 'Queue Update',               'Patient Ng Ah Kow checked in — queue #2.',              'appointment_queue', 'eeeeeeee-eeee-eeee-eeee-eeeeeeee1002'::uuid, false, NULL, now() - interval '45 minutes'),
  ('13131313-1313-1313-1313-000000000006'::uuid, '11111111-1111-1111-1111-111111111001'::uuid, 'staff',       'Shift Conflict Detected',    'Dr. Sarah Chen has overlapping shifts on Friday.',      'shift_schedule',    '99999999-9999-9999-9999-999999999008'::uuid, false, NULL, now() - interval '1 day'),
  ('13131313-1313-1313-1313-000000000007'::uuid, '11111111-1111-1111-1111-111111111001'::uuid, 'system',      'Payroll Draft Ready',        'June payroll draft awaiting approval for 3 staff.',     'payroll_record',    '12121212-1212-1212-1212-000000000003'::uuid, false, NULL, now() - interval '6 hours'),
  ('13131313-1313-1313-1313-000000000008'::uuid, '11111111-1111-1111-1111-111111111002'::uuid, 'clinical',    'AI Report Ready',            'Chest X-Ray AI summary available for Lee Jia Hui.',     'diagnostic_report', '77777777-7777-7777-7777-777777777003'::uuid, true,  now() - interval '18 hours', now() - interval '20 hours'),
  ('13131313-1313-1313-1313-000000000009'::uuid, '11111111-1111-1111-1111-111111111003'::uuid, 'inventory',   'Low Stock: Heparin',         'Only 8 vials remaining (min 20).',                      'inventory_item',    '55555555-5555-5555-5555-555555555012'::uuid, false, NULL, now() - interval '6 hours'),
  ('13131313-1313-1313-1313-000000000010'::uuid, '11111111-1111-1111-1111-111111111002'::uuid, 'system',      'Welcome to MediSync',        'Your account is ready. Complete your profile in settings.', NULL, NULL, true, now() - interval '30 days', now() - interval '30 days')
ON CONFLICT (id) DO NOTHING;

-- ============================
-- 17. Treatment plans (3, ai_assisted demo)
-- ============================
INSERT INTO treatment_plans (
  id, patient_id, created_by, reviewed_by, title, objectives, status,
  ai_assisted, ai_draft_content, start_date, end_date
)
VALUES
  (
    '88888888-8888-8888-8888-888888888001'::uuid,
    '33333333-3333-3333-3333-333333333001'::uuid,
    '22222222-2222-2222-2222-222222222002'::uuid,
    '22222222-2222-2222-2222-222222222002'::uuid,
    'CAD Management Plan',
    'Reduce cardiovascular risk; optimize lipid control; prevent MI',
    'active',
    true,
    'Continue statin therapy. Lifestyle modification: low-sodium diet, 30 min daily walking. Schedule stress test in 3 months. Monitor BP weekly.',
    now() - interval '5 days',
    now() + interval '90 days'
  ),
  (
    '88888888-8888-8888-8888-888888888002'::uuid,
    '33333333-3333-3333-3333-333333333003'::uuid,
    '22222222-2222-2222-2222-222222222002'::uuid,
    NULL,
    'Heart Failure Decompensation Plan',
    'Stabilize hemodynamics; reduce fluid overload; prevent readmission',
    'active',
    true,
    'Daily weight monitoring. Strict fluid restriction 1.5L/day. Continue diuretics and beta-blocker. Cardiology follow-up in 1 week.',
    now() - interval '3 days',
    now() + interval '30 days'
  ),
  (
    '88888888-8888-8888-8888-888888888003'::uuid,
    '33333333-3333-3333-3333-333333333006'::uuid,
    '22222222-2222-2222-2222-222222222002'::uuid,
    '22222222-2222-2222-2222-222222222002'::uuid,
    'Community-Acquired Pneumonia Protocol',
    'Resolve infection; maintain oxygen saturation >94%; prevent complications',
    'active',
    true,
    'IV antibiotics for 48h then step down to oral. Chest physiotherapy twice daily. Repeat CXR in 48h if no improvement.',
    now() - interval '1 day',
    now() + interval '14 days'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO treatment_plan_items (id, plan_id, intervention, frequency, responsible_role, status, sequence_order)
VALUES
  ('14141414-1414-1414-1414-000000000001'::uuid, '88888888-8888-8888-8888-888888888001'::uuid, 'Atorvastatin 20mg nightly',        'Daily',           'doctor', 'done',        1),
  ('14141414-1414-1414-1414-000000000002'::uuid, '88888888-8888-8888-8888-888888888001'::uuid, 'Low-sodium diet counselling',      'Once',            'nurse',  'done',        2),
  ('14141414-1414-1414-1414-000000000003'::uuid, '88888888-8888-8888-8888-888888888001'::uuid, 'Weekly BP monitoring',             'Weekly',          'nurse',  'in_progress', 3),
  ('14141414-1414-1414-1414-000000000004'::uuid, '88888888-8888-8888-8888-888888888002'::uuid, 'Daily weight chart',               'Daily',           'nurse',  'in_progress', 1),
  ('14141414-1414-1414-1414-000000000005'::uuid, '88888888-8888-8888-8888-888888888002'::uuid, 'Furosemide 40mg',                  'Daily',           'doctor', 'done',        2),
  ('14141414-1414-1414-1414-000000000006'::uuid, '88888888-8888-8888-8888-888888888002'::uuid, 'Fluid restriction education',      'Once',            'nurse',  'pending',     3),
  ('14141414-1414-1414-1414-000000000007'::uuid, '88888888-8888-8888-8888-888888888003'::uuid, 'IV Amoxicillin 500mg TDS',         'Three times daily','nurse', 'in_progress', 1),
  ('14141414-1414-1414-1414-000000000008'::uuid, '88888888-8888-8888-8888-888888888003'::uuid, 'Chest physiotherapy',              'Twice daily',     'nurse',  'in_progress', 2),
  ('14141414-1414-1414-1414-000000000009'::uuid, '88888888-8888-8888-8888-888888888003'::uuid, 'Repeat chest X-ray',               'Once in 48h',     'doctor', 'pending',     3)
ON CONFLICT (id) DO NOTHING;

COMMIT;
