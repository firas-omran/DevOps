import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { DetectionsPage } from '../pages/DetectionsPage'
import { DetectorsPage } from '../pages/DetectorsPage'
import { MonitoringPage } from '../pages/MonitoringPage'

type DetectorRecord = {
  id: string
  name: string
  status: 'draft' | 'active' | 'archived'
  sensitivity: number
  window_size_seconds: number
  window_step_seconds: number
  features: string[]
}

describe('lab1 user flows', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('detectors page creates and archives detector configs through REST calls', async () => {
    const detectors: DetectorRecord[] = [
      {
        id: 'det-1',
        name: 'Default detector',
        status: 'active',
        sensitivity: 0.7,
        window_size_seconds: 60,
        window_step_seconds: 30,
        features: ['bytes_per_sec', 'packets_per_sec'],
      },
    ]

    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.endsWith('/detectors') && method === 'GET') {
        return { ok: true, status: 200, json: async () => [...detectors] } as Response
      }

      if (url.endsWith('/detectors') && method === 'POST') {
        const payload = JSON.parse(String(init?.body)) as Omit<DetectorRecord, 'id'>
        detectors.unshift({
          id: `det-${detectors.length + 1}`,
          ...payload,
        })
        return { ok: true, status: 201, json: async () => detectors[0] } as Response
      }

      if (url.includes('/detectors/') && method === 'DELETE') {
        const detectorId = url.split('/').pop() as string
        const target = detectors.find((item) => item.id === detectorId)
        if (target) {
          target.status = 'archived'
        }
        return { ok: true, status: 204, json: async () => undefined } as Response
      }

      return { ok: false, status: 404, json: async () => ({ detail: 'unexpected request' }) } as Response
    })

    render(<DetectorsPage />)

    await screen.findByText(/Configured detectors/i)
    await screen.findByText(/Default detector/)

    fireEvent.change(screen.getByLabelText(/Detector name/i), {
      target: { value: 'Spike detector' },
    })
    fireEvent.change(screen.getByLabelText(/^Status$/i), {
      target: { value: 'draft' },
    })
    fireEvent.change(screen.getByLabelText(/Features \(comma-separated\)/i), {
      target: { value: 'latency_ms, packets_per_sec' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save detector/i }))

    await screen.findByText(/Spike detector/)
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost/api/detectors', expect.objectContaining({ method: 'POST' }))

    const spikeDetectorEntry = screen.getByText(/Spike detector/).closest('li')
    expect(spikeDetectorEntry).not.toBeNull()
    fireEvent.click(within(spikeDetectorEntry as HTMLElement).getByRole('button', { name: 'Archive' }))

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('http://localhost/api/detectors/det-2', { method: 'DELETE' }),
    )
  })

  test('detections page runs anomaly detection for the selected detector', async () => {
    const detectors = [
      {
        id: 'det-1',
        name: 'Primary detector',
        status: 'active',
        sensitivity: 0.65,
        window_size_seconds: 60,
        window_step_seconds: 30,
        features: ['bytes_per_sec'],
      },
    ]
    const runs = [
      {
        id: 'run-1',
        detector_config_id: 'det-1',
        status: 'completed',
        window_start: '2026-04-10T10:00:00Z',
        window_end: '2026-04-10T10:01:00Z',
        summary: {
          threshold: 0.65,
          features: ['bytes_per_sec'],
          anomaly_score: 0.92,
          is_anomaly: true,
        },
      },
    ]

    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url.includes('/detectors')) {
        return { ok: true, status: 200, json: async () => detectors } as Response
      }

      if (url.includes('/detections/run') && method === 'POST') {
        return { ok: true, status: 201, json: async () => runs[0] } as Response
      }

      if (url.includes('/detections')) {
        return { ok: true, status: 200, json: async () => runs } as Response
      }

      return { ok: false, status: 404, json: async () => ({ detail: 'unexpected request' }) } as Response
    })

    render(<DetectionsPage />)

    await screen.findByText(/Active detector:/)
    await waitFor(() => expect(screen.getByRole('button', { name: /Run detection/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Run detection/i }))

    await screen.findByText('run-1')
    expect(screen.getByText('0.92')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost/api/detections/run', expect.objectContaining({ method: 'POST' }))
  })

  test('monitoring page refreshes traffic and anomaly widgets using detector filter', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url.includes('/traffic/latest')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            points: [
              {
                timestamp: '2026-04-10T10:00:00Z',
                source_id: 'sensor-1',
                metrics: { bytes_per_sec: 320, packets_per_sec: 20, latency_ms: 4 },
              },
            ],
          }),
        } as Response
      }

      if (url.includes('/anomalies/latest')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ id: 'res-1', anomaly_score: 0.88, is_anomaly: true }],
          }),
        } as Response
      }

      return { ok: false, status: 404, json: async () => ({ detail: 'unexpected request' }) } as Response
    })

    render(<MonitoringPage />)

    await screen.findByText(/Latest Traffic/i)
    fireEvent.change(screen.getByPlaceholderText(/optional detector id/i), {
      target: { value: 'det-42' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Refresh now/i }))

    await screen.findByText(/sensor-1/)
    await screen.findByText(/res-1 - score 0.88 - anomaly true/)
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost/api/traffic/latest', undefined)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost/api/anomalies/latest?detector_profile_id=det-42',
      undefined,
    )
  })
})
