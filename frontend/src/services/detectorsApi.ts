import { apiRequest } from './apiClient'

export type DetectorPayload = {
  name: string
  description?: string
  sensitivity: number
  window_size_seconds: number
  window_step_seconds: number
  features: string[]
  status?: 'draft' | 'active' | 'archived'
}

export const detectorsApi = {
  list: () => apiRequest<any[]>('/detectors'),
  create: (payload: DetectorPayload) =>
    apiRequest<any>('/detectors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Partial<DetectorPayload>) =>
    apiRequest<any>(`/detectors/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  remove: (id: string) => apiRequest<void>(`/detectors/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
