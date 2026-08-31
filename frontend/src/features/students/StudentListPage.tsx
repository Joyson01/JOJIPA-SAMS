import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Camera,
  X,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Smartphone,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  Student,
  StudentCreatePayload,
} from '../../types/student';
import {
  fetchStudents,
  createStudent,
  updateStudent,
  deleteStudent,
} from '../../services/studentApi';
import { formatApiErrorMessage } from '../../utils/apiError';

interface StudentListPageProps {
  onNavigate?: (tab: string, studentId?: string) => void;
}

export const StudentListPage: React.FC<StudentListPageProps> = ({ onNavigate }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const limit = 10;

  // Search & Filter
  const [search, setSearch] = useState<string>('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [activeStudent, setActiveStudent] = useState<Student | null>(null);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // QR Mobile Enrollment Modal
  const [isQrModalOpen, setIsQrModalOpen] = useState<boolean>(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [mobileEnrollLink, setMobileEnrollLink] = useState<string>('');

  // Form
  const [formData, setFormData] = useState<StudentCreatePayload>({
    student_code: '',
    roll_number: '',
    first_name: '',
    last_name: '',
    email: '',
    department: 'Computer Science',
    class_name: 'CSE-4A',
    section: 'A',
    status: 'ACTIVE',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await fetchStudents({
        search: search.trim() || undefined,
        page,
        limit,
      });
      setStudents(listRes.items);
      setTotal(listRes.total);
      setTotalPages(listRes.total_pages);
    } catch (err: any) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const openCreateModal = () => {
    setFormData({
      student_code: `STU-${String(total + 1).padStart(3, '0')}`,
      roll_number: `R-${String(total + 1).padStart(3, '0')}`,
      first_name: '',
      last_name: '',
      email: '',
      department: 'Computer Science',
      class_name: 'CSE-4A',
      section: 'A',
      status: 'ACTIVE',
    });
    setModalError(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (student: Student) => {
    setActiveStudent(student);
    setFormData({
      student_code: student.student_code,
      roll_number: student.roll_number,
      first_name: student.first_name,
      last_name: student.last_name,
      email: student.email,
      department: student.department,
      class_name: student.class_name,
      section: student.section,
      status: student.status,
    });
    setModalError(null);
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (student: Student) => {
    setActiveStudent(student);
    setIsDeleteModalOpen(true);
  };

  const openQrEnrollModal = async (student: Student) => {
    setActiveStudent(student);
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const protocol = window.location.protocol;
    const url = `${protocol}//${host}${port}/mobile-enrollment?student_id=${student.id}`;

    setMobileEnrollLink(url);
    try {
      const qr = await QRCode.toDataURL(url, { width: 260, margin: 2 });
      setQrCodeUrl(qr);
      setIsQrModalOpen(true);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent, continueToEnroll: boolean = false) => {
    e.preventDefault();
    setFormSubmitting(true);
    setModalError(null);
    try {
      const created = await createStudent(formData);
      setIsAddModalOpen(false);
      loadData();
      if (continueToEnroll && onNavigate) {
        onNavigate('enrollment', created.id);
      }
    } catch (err: any) {
      setModalError(formatApiErrorMessage(err, 'Failed to create student.'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStudent) return;
    setFormSubmitting(true);
    setModalError(null);
    try {
      await updateStudent(activeStudent.id, formData);
      setIsEditModalOpen(false);
      loadData();
    } catch (err: any) {
      setModalError(formatApiErrorMessage(err, 'Failed to update student.'));
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!activeStudent) return;
    setFormSubmitting(true);
    try {
      await deleteStudent(activeStudent.id);
      setIsDeleteModalOpen(false);
      loadData();
    } catch (err: any) {
      alert(formatApiErrorMessage(err, 'Failed to delete student.'));
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Students</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage registered students and mobile face enrollment.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Register Student</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search students by name, ID, or email..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition shadow-sm"
          />
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 transition disabled:opacity-50"
          title="Refresh List"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* Student Table or Empty State */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
            Loading students...
          </div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">No students registered yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Register your first student to get started with automated attendance.
            </p>
            <button
              onClick={openCreateModal}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register Student</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-4 py-3.5">ID / Roll</th>
                  <th className="px-4 py-3.5">Class</th>
                  <th className="px-4 py-3.5">Face Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => {
                  const isEnrolled = student.enrollment_status === 'ENROLLED';
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/80 transition">
                      {/* Name & Email */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 text-sm">
                          {student.first_name} {student.last_name}
                        </div>
                        <div className="text-[11px] text-slate-500">{student.email}</div>
                      </td>

                      {/* ID / Roll */}
                      <td className="px-4 py-3.5 text-slate-700">
                        <div className="font-medium">{student.student_code}</div>
                        <div className="text-[10px] text-slate-400">{student.roll_number}</div>
                      </td>

                      {/* Class */}
                      <td className="px-4 py-3.5 text-slate-600">
                        {student.class_name} (Sec {student.section})
                      </td>

                      {/* Face Status */}
                      <td className="px-4 py-3.5">
                        {isEnrolled ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Enrolled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-slate-400">
                            <span className="w-2 h-2 rounded-full border border-slate-300"></span>
                            Not Enrolled
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right space-x-1.5">
                        {/* Mobile QR Enroll */}
                        <button
                          onClick={() => openQrEnrollModal(student)}
                          className="inline-flex items-center gap-1 text-slate-600 hover:text-blue-600 font-medium px-2 py-1 rounded hover:bg-slate-100 transition"
                          title="Enroll via Phone (QR)"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Phone</span>
                        </button>

                        {onNavigate && !isEnrolled && (
                          <button
                            onClick={() => onNavigate('enrollment', student.id)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
                            title="Enroll Face via Webcam"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Webcam</span>
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(student)}
                          className="text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openDeleteModal(student)}
                          className="text-rose-600 hover:text-rose-800 px-2 py-1 rounded hover:bg-rose-50 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {students.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div>
              Showing {students.length} of {total} students
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>
                Page {page} of {totalPages || 1}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: QR Mobile Enrollment */}
      {isQrModalOpen && activeStudent && qrCodeUrl && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-base">Mobile Face Enrollment</h3>
              <button onClick={() => { setIsQrModalOpen(false); loadData(); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block shadow-inner">
              <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 mx-auto rounded-lg" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-900">
                {activeStudent.first_name} {activeStudent.last_name}
              </h4>
              <p className="text-xs text-slate-500">
                Scan this QR code with your mobile phone camera to open the quick mobile face enrollment studio.
              </p>
            </div>

            <div className="text-[11px] font-mono text-slate-400 bg-slate-50 p-2 rounded-lg truncate select-all">
              {mobileEnrollLink}
            </div>

            <button
              onClick={() => { setIsQrModalOpen(false); loadData(); }}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              Done & Refresh
            </button>
          </div>
        </div>
      )}

      {/* Modal: Register Student */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-base">Register Student</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={(e) => handleCreateSubmit(e, false)} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">First Name *</label>
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleFormChange}
                    placeholder="e.g. John"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Last Name *</label>
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleFormChange}
                    placeholder="e.g. Doe"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Student ID *</label>
                  <input
                    type="text"
                    name="student_code"
                    required
                    value={formData.student_code}
                    onChange={handleFormChange}
                    placeholder="STU-001"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Roll Number *</label>
                  <input
                    type="text"
                    name="roll_number"
                    required
                    value={formData.roll_number}
                    onChange={handleFormChange}
                    placeholder="R-001"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-700">Email Address *</label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleFormChange}
                  placeholder="john.doe@campus.edu"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="font-medium text-slate-700">Department</label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleFormChange}
                    placeholder="Computer Science"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Class</label>
                  <input
                    type="text"
                    name="class_name"
                    value={formData.class_name}
                    onChange={handleFormChange}
                    placeholder="CSE-4A"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-medium disabled:opacity-50"
                >
                  Save Student
                </button>
                <button
                  type="button"
                  disabled={formSubmitting}
                  onClick={(e) => handleCreateSubmit(e, true)}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                >
                  Continue to Face Enrollment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Student */}
      {isEditModalOpen && activeStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-base">Edit Student</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleFormChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleFormChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Class</label>
                  <input
                    type="text"
                    name="class_name"
                    value={formData.class_name}
                    onChange={handleFormChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Department</label>
                  <input
                    type="text"
                    name="department"
                    value={formData.department}
                    onChange={handleFormChange}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation */}
      {isDeleteModalOpen && activeStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center space-y-4">
            <h3 className="font-semibold text-slate-900 text-base">Delete Student</h3>
            <p className="text-xs text-slate-500">
              Are you sure you want to delete {activeStudent.first_name} {activeStudent.last_name}?
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSubmit}
                disabled={formSubmitting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium disabled:opacity-50"
              >
                Delete Student
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
