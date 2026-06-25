import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type DocumentRecord = {
  id: string
  originalName: string
  uploadedBy: string
  uploadedAt: string
}

type WorkflowRecord = {
  id: string
  status: string
  currentSignerRole: string | null
  esignSubmission?: {
    signedDocumentUrl?: string | null
    auditLogUrl?: string | null
  } | null
  signers?: Array<{
    role: string
    email: string
    status: string
    placeholder: boolean
  }>
  auditEvents?: Array<{
    eventType: string
    message: string
    createdAt: string
  }>
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000'

function App() {
  const [role1Email, setRole1Email] = useState('role1@example.com')
  const [role2Email, setRole2Email] = useState('role2@example.com')
  const [role3Email, setRole3Email] = useState('role3@example.com')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null)
  const [workflow, setWorkflow] = useState<WorkflowRecord | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [lastResponse, setLastResponse] = useState<unknown>(null)

  const workflowId = workflow?.id
  const statusLabel = workflow?.status || 'Not started'

  const stepState = useMemo(() => {
    return {
      uploaded: Boolean(documentRecord),
      created: Boolean(workflowId),
      tagsReady: Boolean(workflow?.auditEvents?.some((event) => event.eventType === 'signature_tags.added')),
      submitted: Boolean(
        workflow &&
          !['DRAFT'].includes(workflow.status),
      ),
      role2Done: Boolean(
        workflow &&
          ['ROLE_2_COMPLETED_AWAITING_ROLE_3_EMAIL', 'PENDING_ROLE_3_SIGNATURE', 'COMPLETED'].includes(
            workflow.status,
          ),
      ),
      role3EmailSent: Boolean(workflow && ['PENDING_ROLE_3_SIGNATURE', 'COMPLETED'].includes(workflow.status)),
      completed: workflow?.status === 'COMPLETED',
    }
  }, [documentRecord, workflow, workflowId])

  async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, options)
    const text = await response.text()
    const payload = text ? JSON.parse(text) : null

    if (!response.ok) {
      throw new Error(payload?.message || `Request failed with ${response.status}`)
    }

    setLastResponse(payload)
    return payload as T
  }

  async function runAction<T>(name: string, action: () => Promise<T>) {
    setBusyAction(name)
    setError('')
    try {
      return await action()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Something went wrong.'
      setError(message)
      throw caught
    } finally {
      setBusyAction(null)
    }
  }

  async function refreshWorkflow(id = workflowId) {
    if (!id) return
    const updated = await requestJson<WorkflowRecord>(`/workflows/${id}`)
    setWorkflow(updated)
  }

  async function uploadDocument(event: FormEvent) {
    event.preventDefault()
    if (!selectedFile) {
      setError('Choose a PDF file first.')
      return
    }

    await runAction('upload', async () => {
      const data = new FormData()
      data.append('file', selectedFile)

      const uploaded = await requestJson<DocumentRecord>('/documents/upload', {
        method: 'POST',
        headers: {
          'x-user-email': role1Email,
        },
        body: data,
      })
      setDocumentRecord(uploaded)
      setWorkflow(null)
    })
  }

  async function createWorkflow() {
    if (!documentRecord) return

    await runAction('create', async () => {
      const created = await requestJson<WorkflowRecord>('/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: documentRecord.id,
          role1Email,
          role2Email,
          role3PlaceholderEmail: 'placeholder-role-3@example.invalid',
          note: 'Frontend demo workflow',
        }),
      })
      setWorkflow(created)
    })
  }

  async function addTags() {
    if (!workflowId) return

    await runAction('tags', async () => {
      const updated = await requestJson<WorkflowRecord>(`/workflows/${workflowId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tags: [
            {
              role: 'ROLE_2',
              type: 'SIGNATURE',
              page: 1,
              x: 72,
              y: 88,
              width: 220,
              height: 58,
              label: 'Role 2 Signature',
              required: true,
            },
            {
              role: 'ROLE_3',
              type: 'SIGNATURE',
              page: 1,
              x: 72,
              y: 162,
              width: 220,
              height: 58,
              label: 'Role 3 Signature',
              required: true,
            },
          ],
        }),
      })
      setWorkflow(updated)
    })
  }

  async function submitWorkflow() {
    if (!workflowId) return

    await runAction('submit', async () => {
      await requestJson<WorkflowRecord>(`/workflows/${workflowId}/submit`, {
        method: 'POST',
      })
      await refreshWorkflow()
    })
  }

  async function simulateRole2() {
    if (!workflowId) return

    await runAction('role2', async () => {
      await requestJson<WorkflowRecord>('/webhooks/docuseal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'form.completed',
          timestamp: new Date().toISOString(),
          data: {
            id: `mock-${workflowId}-role-2`,
            submission: {
              id: `mock-submission-${workflowId}`,
            },
          },
        }),
      })
      await refreshWorkflow()
    })
  }

  async function updateRole3Email() {
    if (!workflowId) return

    await runAction('role3-email', async () => {
      await requestJson<WorkflowRecord>(`/workflows/${workflowId}/role-3-email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: role3Email }),
      })
      await refreshWorkflow()
    })
  }

  async function simulateRole3() {
    if (!workflowId) return

    await runAction('role3', async () => {
      await requestJson<WorkflowRecord>('/webhooks/docuseal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'form.completed',
          timestamp: new Date().toISOString(),
          data: {
            id: `mock-${workflowId}-role-3`,
            submission: {
              id: `mock-submission-${workflowId}`,
            },
          },
        }),
      })
      await refreshWorkflow()
    })
  }

  async function openSignedPdf() {
    if (!workflowId) return

    await runAction('signed-pdf', async () => {
      const signedDocument = await requestJson<{ signedDocumentUrl?: string }>(
        `/workflows/${workflowId}/signed-document`,
      )
      await refreshWorkflow()
      window.open(`${API_BASE_URL}/workflows/${workflowId}/signed-document/file`, '_blank', 'noopener,noreferrer')
      return signedDocument
    })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">eSign Workflow Demo</p>
          <h1>Sequential signing backend</h1>
        </div>
        <div className="status-pill">
          <span>Status</span>
          <strong>{statusLabel}</strong>
        </div>
      </header>

      <section className="layout">
        <div className="panel controls-panel">
          <form className="upload-block" onSubmit={uploadDocument}>
            <label>
              <span>Role 1 email</span>
              <input value={role1Email} onChange={(event) => setRole1Email(event.target.value)} />
            </label>
            <label>
              <span>Role 2 email</span>
              <input value={role2Email} onChange={(event) => setRole2Email(event.target.value)} />
            </label>
            <label>
              <span>Role 3 email</span>
              <input value={role3Email} onChange={(event) => setRole3Email(event.target.value)} />
            </label>
            <label>
              <span>PDF document</span>
              <input
                accept="application/pdf"
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </label>
            <button type="submit" disabled={busyAction === 'upload'}>
              {busyAction === 'upload' ? 'Uploading...' : 'Upload PDF'}
            </button>
          </form>

          <div className="actions-grid">
            <button type="button" disabled={!documentRecord || Boolean(workflowId)} onClick={createWorkflow}>
              Create workflow
            </button>
            <button type="button" disabled={!workflowId || stepState.tagsReady} onClick={addTags}>
              Add tags
            </button>
            <button type="button" disabled={!stepState.tagsReady || stepState.submitted} onClick={submitWorkflow}>
              Submit
            </button>
            <button type="button" disabled={!stepState.submitted || stepState.role2Done} onClick={simulateRole2}>
              Receive Role 2 webhook
            </button>
            <button type="button" disabled={!stepState.role2Done || stepState.role3EmailSent} onClick={updateRole3Email}>
              Update and send Role 3
            </button>
            <button type="button" disabled={!stepState.role3EmailSent || stepState.completed} onClick={simulateRole3}>
              Receive Role 3 webhook
            </button>
          </div>

          {workflowId ? (
            <button className="secondary-button" type="button" onClick={() => void refreshWorkflow()}>
              Refresh workflow
            </button>
          ) : null}

          {error ? <div className="error-box">{error}</div> : null}
        </div>

        <div className="panel">
          <h2>Progress</h2>
          <ol className="steps">
            <Step done={stepState.uploaded} label="PDF uploaded" />
            <Step done={stepState.created} label="Workflow created" />
            <Step done={stepState.tagsReady} label="Role 2 and Role 3 tags added" />
            <Step done={stepState.submitted} label="Submitted to eSign provider" />
            <Step done={stepState.role2Done} label="Role 2 completed" />
            <Step done={stepState.role3EmailSent} label="Role 3 email updated and sent" />
            <Step done={stepState.completed} label="Workflow completed" />
          </ol>

          <div className="record-grid">
            <Record label="Document ID" value={documentRecord?.id} />
            <Record label="Workflow ID" value={workflowId} />
            <Record label="Current signer" value={workflow?.currentSignerRole || 'None'} />
            <Record label="Signed PDF" value={workflow?.esignSubmission?.signedDocumentUrl || '-'} />
          </div>

          <button
            className="signed-button"
            type="button"
            disabled={!stepState.completed}
            onClick={openSignedPdf}
          >
            Open signed PDF
          </button>
        </div>
      </section>

      <section className="layout lower-layout">
        <div className="panel">
          <h2>Signers</h2>
          <div className="signer-list">
            {workflow?.signers?.map((signer) => (
              <div className="signer-row" key={signer.role}>
                <div>
                  <strong>{signer.role}</strong>
                  <span>{signer.email}</span>
                </div>
                <em>{signer.status}</em>
              </div>
            )) || <p className="muted">Create a workflow to see signer state.</p>}
          </div>
        </div>

        <div className="panel">
          <h2>Audit trail</h2>
          <div className="audit-list">
            {workflow?.auditEvents?.map((event) => (
              <div className="audit-item" key={`${event.eventType}-${event.createdAt}`}>
                <strong>{event.eventType}</strong>
                <span>{event.message}</span>
              </div>
            )) || <p className="muted">Workflow events will appear here.</p>}
          </div>
        </div>
      </section>

      <section className="panel response-panel">
        <h2>Last API response</h2>
        <pre>{JSON.stringify(lastResponse || { apiBaseUrl: API_BASE_URL }, null, 2)}</pre>
      </section>
    </main>
  )
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={done ? 'done' : ''}>
      <span>{done ? 'OK' : ''}</span>
      {label}
    </li>
  )
}

function Record({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  )
}

export default App
