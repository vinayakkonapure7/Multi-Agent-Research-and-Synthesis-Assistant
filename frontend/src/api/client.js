import axios from 'axios'

const client = axios.create({ baseURL: '/api' })

export const api = {
  // Projects
  createProject: (topic, context = '') => client.post('/projects', { topic, context }).then(r => r.data),
  getProject: (id) => client.get(`/projects/${id}`).then(r => r.data),
  generateOutline: (id) => client.post(`/projects/${id}/generate-outline`).then(r => r.data),
  researchCheckpoint: (id) => client.post(`/projects/${id}/research-checkpoint`).then(r => r.data),
  approveOutline: (id, sections) => client.post(`/projects/${id}/approve-outline`, { sections }).then(r => r.data),
  listSections: (id) => client.get(`/projects/${id}/sections`).then(r => r.data),
  deleteProject: (id) => client.delete(`/projects/${id}`).then(r => r.data),

  // Sources
  listSources: (projectId) => client.get(`/projects/${projectId}/sources`).then(r => r.data),
  uploadSource: (projectId, file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return client.post(`/projects/${projectId}/sources/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }).then(r => r.data)
  },
  addUrlSource: (projectId, url) => client.post(`/projects/${projectId}/sources/url`, { url }).then(r => r.data),
  getSourceStatus: (projectId, sourceId) => client.get(`/projects/${projectId}/sources/${sourceId}/status`).then(r => r.data),
  deleteSource: (projectId, sourceId) => client.delete(`/projects/${projectId}/sources/${sourceId}`).then(r => r.data),

  // Sections (drafting workflow)
  draftSection: (sectionId, payload) => client.post(`/sections/${sectionId}/draft`, payload).then(r => r.data),
  regenerateSection: (sectionId, feedback, opts) => client.post(`/sections/${sectionId}/regenerate`, { feedback, ...opts }).then(r => r.data),
  listVersions: (sectionId) => client.get(`/sections/${sectionId}/versions`).then(r => r.data),
  approveSection: (sectionId) => client.post(`/sections/${sectionId}/approve`).then(r => r.data),
  editApprovedSection: (sectionId, content) => client.post(`/sections/${sectionId}/edit`, { content }).then(r => r.data),

  // Export
  exportUrl: (projectId) => `/api/projects/${projectId}/export`,
}

export default api
