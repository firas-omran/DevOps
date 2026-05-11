import { apiRequest } from './apiClient'

export type GeneratorJobCreate = {
  profile_name: string
  batch_size: number
  interval_ms: number
  duration_seconds: number
}

export const generatorApi = {
  create: (payload: GeneratorJobCreate) =>
    apiRequest<any>('/generator/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  get: (id: string) => apiRequest<any>(`/generator/jobs/${encodeURIComponent(id)}`),
  stop: (id: string) =>
    apiRequest<any>(`/generator/jobs/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
    }),
}
