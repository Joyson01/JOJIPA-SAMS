export interface AttendanceSession {
  id: string;
  session_code: string;
  class_name: string;
  subject: string;
  room: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  camera_ids: string[];
  total_records: number;
  present_count: number;
  late_count: number;
  absent_count: number;
  created_at: string;
  updated_at: string;
}

export interface SessionCreatePayload {
  session_code: string;
  class_name: string;
  subject: string;
  room: string;
  scheduled_date?: string;
  start_time: string;
  end_time: string;
  camera_ids?: string[];
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  student_code: string;
  roll_number: string;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'MANUAL_PRESENT' | 'MANUAL_ABSENT';
  confidence: number;
  first_seen: string;
  last_seen: string;
  track_id?: number | null;
  liveness_score: number;
  remarks?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceOverridePayload {
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'MANUAL_PRESENT' | 'MANUAL_ABSENT';
  remarks: string;
}

