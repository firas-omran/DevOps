import { apiRequest } from './apiClient'

export const detectionsApi = {
  run: (payload: any) =>
    apiRequest<any>('/detections/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  list: (detectorProfileId?: string) =>
    apiRequest<any[]>(
      detectorProfileId
        ? `/detections?detector_profile_id=${encodeURIComponent(detectorProfileId)}`
        : '/detections',
    ),
  get: (id: string) => apiRequest<any>(`/detections/${encodeURIComponent(id)}`),
  results: (id: string) => apiRequest<{ results: any[] }>(`/detections/${encodeURIComponent(id)}/results`),
}
