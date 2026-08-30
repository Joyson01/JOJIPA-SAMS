export interface MediaAttendanceItem {
  student_id?: string | null;
  student_name: string;
  student_code?: string | null;
  roll_number?: string | null;
  confidence: number;
  confidence_pct: number;
  attendance_status: string;
  decision: 'KNOWN' | 'UNKNOWN' | 'UNCERTAIN';
  first_seen?: string | null;
  last_seen?: string | null;
  observation_count: number;
  remarks?: string | null;
}

export interface UnresolvedFaceItem {
  face_id: string;
  decision: 'UNKNOWN' | 'UNCERTAIN';
  confidence: number;
  confidence_pct: number;
  timestamp_sec?: number | null;
  frame_number?: number | null;
  bbox: number[];
  quality_score: number;
  rejection_reason?: string | null;
}

export interface MediaAnalysisResponse {
  job_id?: string | null;
  session_id: string;
  session_subject: string;
  session_class: string;
  media_type: 'IMAGE' | 'VIDEO';
  filename: string;
  duration_sec?: number | null;
  resolution?: string | null;
  faces_detected: number;
  recognized_count: number;
  unknown_count: number;
  uncertain_count: number;
  attendance_marked_count: number;
  recognized_students: MediaAttendanceItem[];
  unresolved_faces: UnresolvedFaceItem[];
  processing_time_ms: number;
  status: string;
}

export interface MediaJobResponse {
  id: string;
  session_id: string;
  session_subject?: string | null;
  session_class?: string | null;
  media_type: 'IMAGE' | 'VIDEO';
  filename: string;
  file_size_bytes?: number | null;
  duration_sec?: number | null;
  resolution?: string | null;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress_pct: number;
  frames_total: number;
  frames_processed: number;
  faces_detected_total: number;
  recognized_count: number;
  unknown_count: number;
  uncertain_count: number;
  attendance_marked_count: number;
  summary_json?: {
    recognized?: MediaAttendanceItem[];
    unresolved?: UnresolvedFaceItem[];
  } | null;
  error_message?: string | null;
  created_by?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}
