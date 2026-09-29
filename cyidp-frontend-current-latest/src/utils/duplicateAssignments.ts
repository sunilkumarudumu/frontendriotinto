export type DuplicateAssignmentRecord = {
  jobId: string
  sourceDocumentId: string
  documentId: string
  assignedToUser: string
  assignedByAdmin: string
  assignedAt: string
}

type DuplicateAssignmentMap = Record<string, DuplicateAssignmentRecord>

type AssignmentInput = {
  sourceDocumentId: string
  documentId: string
}

const DUPLICATE_ASSIGNMENTS_STORAGE_KEY = 'cyidp_duplicate_assignments_v1'

const buildAssignmentKey = (jobId: string, sourceDocumentId: string, documentId: string): string => {
  return `${jobId}::${sourceDocumentId}::${documentId}`
}

const loadAssignmentMap = (): DuplicateAssignmentMap => {
  try {
    const raw = localStorage.getItem(DUPLICATE_ASSIGNMENTS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DuplicateAssignmentMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const saveAssignmentMap = (assignments: DuplicateAssignmentMap): void => {
  localStorage.setItem(DUPLICATE_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments))
}

export const assignDuplicateRecordsToUser = (
  jobId: string,
  records: AssignmentInput[],
  assignedToUser: string,
  assignedByAdmin: string,
): number => {
  const normalizedJobId = jobId.trim()
  const normalizedAssignedToUser = assignedToUser.trim()
  const normalizedAssignedByAdmin = assignedByAdmin.trim()
  if (!normalizedJobId || !normalizedAssignedToUser || !records.length) return 0

  const assignments = loadAssignmentMap()
  const now = new Date().toISOString()
  let assignedCount = 0

  records.forEach((record) => {
    const sourceDocumentId = record.sourceDocumentId.trim()
    const documentId = record.documentId.trim()
    if (!sourceDocumentId || !documentId) return

    const key = buildAssignmentKey(normalizedJobId, sourceDocumentId, documentId)
    assignments[key] = {
      jobId: normalizedJobId,
      sourceDocumentId,
      documentId,
      assignedToUser: normalizedAssignedToUser,
      assignedByAdmin: normalizedAssignedByAdmin,
      assignedAt: now,
    }
    assignedCount += 1
  })

  saveAssignmentMap(assignments)
  return assignedCount
}

export const getDuplicateAssignmentForRecord = (
  jobId: string,
  sourceDocumentId: string,
  documentId: string,
): DuplicateAssignmentRecord | null => {
  const normalizedJobId = jobId.trim()
  const normalizedSourceDocumentId = sourceDocumentId.trim()
  const normalizedDocumentId = documentId.trim()
  if (!normalizedJobId || !normalizedSourceDocumentId || !normalizedDocumentId) return null

  const assignments = loadAssignmentMap()
  const key = buildAssignmentKey(normalizedJobId, normalizedSourceDocumentId, normalizedDocumentId)
  return assignments[key] ?? null
}

export const getDuplicateAssignmentsForJob = (jobId: string): DuplicateAssignmentRecord[] => {
  const normalizedJobId = jobId.trim()
  if (!normalizedJobId) return []

  return Object.values(loadAssignmentMap()).filter(
    (assignment) => assignment.jobId.trim() === normalizedJobId,
  )
}

export const canUserAccessDocument = (
  jobId: string,
  documentId: string,
  username: string | null | undefined,
  role: 'admin' | 'user' | null | undefined,
): boolean => {
  if (role === 'admin') return true

  const normalizedJobId = jobId.trim()
  const normalizedDocumentId = documentId.trim()
  if (!normalizedJobId || !normalizedDocumentId) return true

  const assignmentsForDocument = getDuplicateAssignmentsForJob(normalizedJobId).filter(
    (assignment) =>
      assignment.sourceDocumentId.trim() === normalizedDocumentId ||
      assignment.documentId.trim() === normalizedDocumentId,
  )

  // Unassigned docs remain visible under existing/common access rules.
  if (assignmentsForDocument.length === 0) return true

  const normalizedUsername = (username || '').trim().toLowerCase()
  if (!normalizedUsername) return false

  return assignmentsForDocument.some(
    (assignment) => assignment.assignedToUser.trim().toLowerCase() === normalizedUsername,
  )
}
