import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  X,
  GraduationCap,
  AlertCircle,
} from 'lucide-react';
import {
  fetchSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  fetchClasses,
  createClass,
  updateClass,
  deleteClass,
} from '../../services/subjectApi';
import {
  Subject,
  SubjectCreatePayload,
  ClassSection,
  ClassSectionCreatePayload,
} from '../../types/subject';

export const SubjectManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'subjects' | 'classes'>('subjects');

  // Subjects state
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(true);
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [semFilter, setSemFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Subject Modals
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState<boolean>(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectForm, setSubjectForm] = useState<SubjectCreatePayload>({
    code: '',
    name: '',
    short_name: '',
    department: 'Computer Science',
    credits: 4,
    semester: 4,
    academic_year: '2026-2027',
    status: 'ACTIVE',
  });

  // Classes state
  const [classes, setClasses] = useState<ClassSection[]>([]);
  const [loadingClasses, setLoadingClasses] = useState<boolean>(true);
  const [isClassModalOpen, setIsClassModalOpen] = useState<boolean>(false);
  const [editingClass, setEditingClass] = useState<ClassSection | null>(null);
  const [classForm, setClassForm] = useState<ClassSectionCreatePayload>({
    name: '',
    department: 'Computer Science',
    year: 4,
    semester: 4,
    section: 'A',
    academic_year: '2026-2027',
    status: 'ACTIVE',
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    try {
      const data = await fetchSubjects(
        deptFilter || undefined,
        semFilter ? parseInt(semFilter) : undefined,
        statusFilter || undefined,
        subjectSearch || undefined
      );
      setSubjects(data);
    } catch (err) {
      console.error('Failed to load subjects:', err);
    } finally {
      setLoadingSubjects(false);
    }
  }, [deptFilter, semFilter, statusFilter, subjectSearch]);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    try {
      const data = await fetchClasses();
      setClasses(data);
    } catch (err) {
      console.error('Failed to load classes:', err);
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // Handle Subject Form Submit
  const handleSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      if (editingSubject) {
        await updateSubject(editingSubject.id, subjectForm);
      } else {
        await createSubject(subjectForm);
      }
      setIsSubjectModalOpen(false);
      setEditingSubject(null);
      loadSubjects();
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail?.message ||
        err.response?.data?.detail ||
        'Failed to save subject. Make sure the subject code is unique.'
      );
    }
  };

  // Handle Delete / Deactivate Subject
  const handleDeleteSubject = async (subj: Subject) => {
    if (
      window.confirm(
        subj.total_sessions_count > 0
          ? `Subject "${subj.code}" has ${subj.total_sessions_count} sessions. It will be marked INACTIVE to preserve historical attendance. Proceed?`
          : `Are you sure you want to delete subject "${subj.code} - ${subj.name}"?`
      )
    ) {
      try {
        await deleteSubject(subj.id);
        loadSubjects();
      } catch (err) {
        alert('Failed to delete/deactivate subject.');
      }
    }
  };

  // Handle Class Form Submit
  const handleClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      if (editingClass) {
        await updateClass(editingClass.id, classForm);
      } else {
        await createClass(classForm);
      }
      setIsClassModalOpen(false);
      setEditingClass(null);
      loadClasses();
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail?.message ||
        err.response?.data?.detail ||
        'Failed to save class section. Make sure the class name is unique.'
      );
    }
  };

  // Handle Delete Class
  const handleDeleteClass = async (cls: ClassSection) => {
    if (window.confirm(`Are you sure you want to delete class section "${cls.name}"?`)) {
      try {
        await deleteClass(cls.id);
        loadClasses();
      } catch (err) {
        alert('Failed to delete class section.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Academic Setup</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage academic subjects, course credits, and student class sections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'subjects' ? (
            <button
              onClick={() => {
                setEditingSubject(null);
                setSubjectForm({
                  code: '',
                  name: '',
                  short_name: '',
                  department: 'Computer Science',
                  credits: 4,
                  semester: 4,
                  academic_year: '2026-2027',
                  status: 'ACTIVE',
                });
                setErrorMessage(null);
                setIsSubjectModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Subject</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setEditingClass(null);
                setClassForm({
                  name: '',
                  department: 'Computer Science',
                  year: 4,
                  semester: 4,
                  section: 'A',
                  academic_year: '2026-2027',
                  status: 'ACTIVE',
                });
                setErrorMessage(null);
                setIsClassModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Class / Section</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('subjects')}
          className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
            activeTab === 'subjects'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Subjects ({subjects.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('classes')}
          className={`pb-3 text-xs font-bold transition flex items-center gap-2 border-b-2 ${
            activeTab === 'classes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Classes & Sections ({classes.length})</span>
        </button>
      </div>

      {/* TAB 1: SUBJECTS */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search subject code or name..."
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="">All Departments</option>
              <option value="Computer Science">Computer Science</option>
              <option value="Information Technology">Information Technology</option>
              <option value="Electronics">Electronics</option>
            </select>

            <select
              value={semFilter}
              onChange={(e) => setSemFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>

            <button
              onClick={() => {
                setSubjectSearch('');
                setDeptFilter('');
                setSemFilter('');
                setStatusFilter('');
              }}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
            >
              Clear
            </button>
          </div>

          {/* Subject Table or Clean Empty State */}
          {loadingSubjects ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
              Loading subjects...
            </div>
          ) : subjects.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-sm">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800">No subjects yet.</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Create subjects like Computer Networks or Artificial Intelligence to schedule attendance sessions.
              </p>
              <button
                onClick={() => {
                  setEditingSubject(null);
                  setSubjectForm({
                    code: '',
                    name: '',
                    short_name: '',
                    department: 'Computer Science',
                    credits: 4,
                    semester: 4,
                    academic_year: '2026-2027',
                    status: 'ACTIVE',
                  });
                  setErrorMessage(null);
                  setIsSubjectModalOpen(true);
                }}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Subject</span>
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Subject Code</th>
                    <th className="py-3 px-4">Subject Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Semester</th>
                    <th className="py-3 px-4">Credits</th>
                    <th className="py-3 px-4">Sessions</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subjects.map((subj) => {
                    const isActive = subj.status === 'ACTIVE';
                    return (
                      <tr key={subj.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          {subj.code}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{subj.name}</div>
                          {subj.short_name && (
                            <div className="text-[11px] text-slate-400">({subj.short_name})</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">{subj.department}</td>
                        <td className="py-3.5 px-4 font-medium text-slate-700">Sem {subj.semester}</td>
                        <td className="py-3.5 px-4 text-slate-700">{subj.credits} Credits</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {subj.total_sessions_count}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isActive ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            ></span>
                            <span>{subj.status}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingSubject(subj);
                                setSubjectForm({
                                  code: subj.code,
                                  name: subj.name,
                                  short_name: subj.short_name || '',
                                  department: subj.department,
                                  credits: subj.credits,
                                  semester: subj.semester,
                                  academic_year: subj.academic_year,
                                  status: subj.status,
                                });
                                setErrorMessage(null);
                                setIsSubjectModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              title="Edit Subject"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteSubject(subj)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                              title={
                                subj.total_sessions_count > 0
                                  ? 'Deactivate Subject'
                                  : 'Delete Subject'
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CLASSES & SECTIONS */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          {loadingClasses ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
              Loading class sections...
            </div>
          ) : classes.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-sm">
              <GraduationCap className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800">No classes registered yet.</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Create class sections like CSE-4A or ECE-3B to associate students and attendance sessions.
              </p>
              <button
                onClick={() => {
                  setEditingClass(null);
                  setClassForm({
                    name: '',
                    department: 'Computer Science',
                    year: 4,
                    semester: 4,
                    section: 'A',
                    academic_year: '2026-2027',
                    status: 'ACTIVE',
                  });
                  setErrorMessage(null);
                  setIsClassModalOpen(true);
                }}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Class</span>
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Class / Section</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Year & Sem</th>
                    <th className="py-3 px-4">Academic Year</th>
                    <th className="py-3 px-4">Enrolled Students</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {classes.map((cls) => {
                    const isActive = cls.status === 'ACTIVE';
                    return (
                      <tr key={cls.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-900">{cls.name}</td>
                        <td className="py-3.5 px-4 text-slate-700">{cls.department}</td>
                        <td className="py-3.5 px-4 text-slate-700">
                          Year {cls.year} • Sem {cls.semester} (Sec {cls.section})
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">{cls.academic_year}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[11px]">
                            {cls.student_count} Students
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isActive ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            ></span>
                            <span>{cls.status}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingClass(cls);
                                setClassForm({
                                  name: cls.name,
                                  department: cls.department,
                                  year: cls.year,
                                  semester: cls.semester,
                                  section: cls.section,
                                  academic_year: cls.academic_year,
                                  status: cls.status,
                                });
                                setErrorMessage(null);
                                setIsClassModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClass(cls)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Add/Edit Subject */}
      {isSubjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {editingSubject ? 'Edit Subject' : 'Add Subject'}
              </h3>
              <button
                onClick={() => setIsSubjectModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubjectSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Subject Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS401"
                    value={subjectForm.code}
                    onChange={(e) =>
                      setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })
                    }
                    disabled={!!editingSubject}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Short Name</label>
                  <input
                    type="text"
                    placeholder="e.g. CN"
                    value={subjectForm.short_name || ''}
                    onChange={(e) =>
                      setSubjectForm({ ...subjectForm, short_name: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-700">Subject Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Computer Networks"
                  value={subjectForm.name}
                  onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Department *</label>
                  <input
                    type="text"
                    required
                    value={subjectForm.department}
                    onChange={(e) =>
                      setSubjectForm({ ...subjectForm, department: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Academic Year</label>
                  <input
                    type="text"
                    value={subjectForm.academic_year}
                    onChange={(e) =>
                      setSubjectForm({ ...subjectForm, academic_year: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Semester *</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={subjectForm.semester}
                    onChange={(e) =>
                      setSubjectForm({ ...subjectForm, semester: parseInt(e.target.value) || 1 })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Credits *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={subjectForm.credits}
                    onChange={(e) =>
                      setSubjectForm({ ...subjectForm, credits: parseInt(e.target.value) || 4 })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Status</label>
                  <select
                    value={subjectForm.status}
                    onChange={(e) => setSubjectForm({ ...subjectForm, status: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSubjectModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
                >
                  {editingSubject ? 'Update Subject' : 'Save Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add/Edit Class Section */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {editingClass ? 'Edit Class Section' : 'Add Class Section'}
              </h3>
              <button
                onClick={() => setIsClassModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleClassSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-slate-700">Class Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CSE-4A"
                  value={classForm.name}
                  onChange={(e) =>
                    setClassForm({ ...classForm, name: e.target.value.toUpperCase() })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Department *</label>
                  <input
                    type="text"
                    required
                    value={classForm.department}
                    onChange={(e) =>
                      setClassForm({ ...classForm, department: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Section</label>
                  <input
                    type="text"
                    placeholder="e.g. A"
                    value={classForm.section}
                    onChange={(e) => setClassForm({ ...classForm, section: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Year</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={classForm.year}
                    onChange={(e) =>
                      setClassForm({ ...classForm, year: parseInt(e.target.value) || 4 })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Semester</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={classForm.semester}
                    onChange={(e) =>
                      setClassForm({ ...classForm, semester: parseInt(e.target.value) || 4 })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Status</label>
                  <select
                    value={classForm.status}
                    onChange={(e) => setClassForm({ ...classForm, status: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
                >
                  {editingClass ? 'Update Class' : 'Save Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
