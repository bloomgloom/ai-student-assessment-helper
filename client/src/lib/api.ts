import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export default api;

// Settings
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: Record<string, unknown>) => api.put('/settings', data),
  test: () => api.post('/settings/test'),
  reset: () => api.post('/settings/reset'),
  // omlx 서버에서 로드된 모델 목록 조회
  getOmlxModels: (baseUrl: string, apiKey: string) =>
    api.get('/settings/omlx-models', { params: { baseUrl, apiKey } }),
};

// Criteria (Domain Based)
export const criteriaApi = {
  getSets: () => api.get('/criteria/sets'), // legacy
  getSubjects: () => api.get('/criteria/subjects'),
  getDomainSubjects: () => api.get('/criteria/domain-subjects'),
  getStandardSubjects: () => api.get('/criteria/standard-subjects'),
  getDomains: (year: number, semester: number, grade: number, subject: string) =>
    api.get('/criteria/domains', { params: { year, semester, grade, subject } }),
  uploadDomains: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/criteria/domains/upload', form);
  },
  sourceUrl: (kind: 'domains' | 'standards', year: number, semester: number, grade: number, subject: string) =>
    `/api/criteria/${kind}/source-file?year=${year}&semester=${semester}&grade=${grade}&subject=${encodeURIComponent(subject)}`,
  deleteSource: (kind: 'domains' | 'standards', year: number, semester: number, grade: number, subject: string) =>
    api.delete(`/criteria/${kind}/source-file`, { params: { year, semester, grade, subject } }),
  getStandards: (year: number, semester: number, grade: number, subject: string) =>
    api.get('/criteria/standards', { params: { year, semester, grade, subject } }),
  uploadStandards: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/criteria/standards/upload', form);
  },
  addCustomDomain: (data: { year: number, semester: number, grade: number, subject: string, name: string }) =>
    api.post('/criteria/custom-domains', data),
  deleteCustomDomain: (id: number) => api.delete(`/criteria/custom-domains/${id}`),

  // 세특
  getSetech: (year: number, semester: number, grade: number, subject: string, domainName: string) => 
    api.get('/criteria/setech', { params: { year, semester, grade, subject, domainName } }),
  bulkSaveSetech: (year: number, semester: number, grade: number, subject: string, domainName: string, items: unknown[]) =>
    api.put('/criteria/setech/bulk', { year, semester, grade, subject, domainName, items }),

  // 평가
  getEval: (year: number, semester: number, grade: number, subject: string, domainName: string) => 
    api.get('/criteria/eval', { params: { year, semester, grade, subject, domainName } }),
  bulkSaveEval: (year: number, semester: number, grade: number, subject: string, domainName: string, items: unknown[]) =>
    api.put('/criteria/eval/bulk', { year, semester, grade, subject, domainName, items }),
};

// Records / Sessions
export const recordsApi = {
  getSessions: () => api.get('/records/sessions'),
  createSession: (data: { name: string; criteria_id?: number }) =>
    api.post('/records/sessions', data),
  updateSession: (id: number, data: { name: string; criteria_id?: number }) =>
    api.put(`/records/sessions/${id}`, data),
  deleteSession: (id: number) => api.delete(`/records/sessions/${id}`),

  importExcel: (sessionId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/records/sessions/${sessionId}/import-excel`, form);
  },
  getStudents: (sessionId: number) => api.get(`/records/sessions/${sessionId}/students`),
  getStudentContent: (studentId: number) => api.get(`/records/students/${studentId}/content`),
  saveStudentContent: (
    studentId: number,
    data: { content_type: string; domain: string; content: string }
  ) => api.put(`/records/students/${studentId}/content`, data),
  exportExcel: (sessionId: number, type: 'setech' | 'scoring') =>
    api.get(`/records/sessions/${sessionId}/export?type=${type}`, { responseType: 'blob' }),
};

// Artifacts
export const artifactsApi = {
  getOne: (id: number) => api.get(`/artifacts/${id}`),
  getByStudent: (studentId: number) => api.get(`/artifacts/student/${studentId}`),
  getByDomain: (studentId: number, domain: string) =>
    api.get(`/artifacts/student/${studentId}/domain/${encodeURIComponent(domain)}`),
  upload: (studentId: number, domain: string, files: FileList) => {
    const form = new FormData();
    form.append('domain', domain);
    Array.from(files).forEach((f) => form.append('files', f));
    return api.post(`/artifacts/student/${studentId}`, form);
  },
  delete: (id: number) => api.delete(`/artifacts/${id}`),
  fileUrl: (id: number) => `/api/artifacts/${id}/file`,
  viewerUrl: (id: number) => `/artifacts/${id}/view`,
};

// Classes (수업 관리)
export const classesApi = {
  getAll: () => api.get('/classes'),
  getOne: (id: number) => api.get(`/classes/${id}`),
  getStudents: (id: number) => api.get(`/classes/${id}/students`),
  getDomains: (id: number) => api.get(`/classes/${id}/domains`),
  upload: (file: File, setechFile?: File | null) => {
    const form = new FormData();
    form.append('scoringFile', file);
    if (setechFile) form.append('setechFile', setechFile);
    return api.post('/classes/upload', form);
  },
  uploadScoring: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/classes/upload/scoring', form);
  },
  uploadSetech: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/classes/upload/setech', form);
  },
  delete: (id: number) => api.delete(`/classes/${id}`),
  deleteScoring: (id: number) => api.delete(`/classes/${id}/scoring`),
  deleteSetech: (id: number) => api.delete(`/classes/${id}/setech`),
  syncSession: (classId: number, sessionId: number) =>
    api.post(`/classes/${classId}/sync-session/${sessionId}`),
};

// AI
export const aiApi = {
  generate: (data: {
    studentId: number;
    domain: string;
    contentType: 'scoring' | 'setech';
    criteriaSetId: number;
  }) => api.post('/ai/generate', data),
  spellcheck: (data: { text: string }) => api.post('/ai/spellcheck', data),
};
