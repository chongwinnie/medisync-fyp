export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface AppointmentItem {
  id: string;
  patient_id?: string;
  staff_id?: string;
  patient_name: string;
  staff_name: string;
  start_time: string;
  end_time: string;
  visit_type: string;
  status: AppointmentStatus;
  room?: string;
  conflict_detected?: boolean;
  notes?: string;
}

export interface AppointmentFormOption {
  id: string;
  label: string;
}
