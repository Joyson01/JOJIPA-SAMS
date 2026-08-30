export interface Subject {
  id: string;
  code: string;
  name: string;
  short_name?: string;
  department: string;
  credits: number;
  semester: number;
  academic_year: string;
  status: 'ACTIVE' | 'INACTIVE';
  total_sessions_count: number;
  created_at: string;
  updated_at: string;
}

export interface SubjectCreatePayload {
  code: string;
  name: string;
  short_name?: string;
  department: string;
  credits: number;
  semester: number;
  academic_year: string;
  status: string;
}

export interface ClassSection {
  id: string;
  name: string;
  department: string;
  year: number;
  semester: number;
  section: string;
  academic_year: string;
  status: 'ACTIVE' | 'INACTIVE';
  student_count: number;
  created_at: string;
  updated_at: string;
}

export interface ClassSectionCreatePayload {
  name: string;
  department: string;
  year: number;
  semester: number;
  section: string;
  academic_year: string;
  status: string;
}

