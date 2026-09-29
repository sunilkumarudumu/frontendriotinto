import type {
  AssetClassificationResult,
  ClassificationResult,
  ConfidentialSummary,
  Document,
  DocumentDetails,
  RetentionInfo,
} from '../api/client'

export type MetadataField = {
  label: string
  value: string
}

export type DocumentMetadataView = {
  filename: string
  creationDate: string
  boxId: string
  classificationStatus: string
  asset: string
  confidential: string
  confidentialSource: string
  confidentialMatchedTerms: string
  folderKey: string
  filePath: string
  folderPath: string
  folder: string
  subFolder: string
  folderStructure: string
  dataType: string
  discipline: string
  businessFunction: string
  contentType: string
  library: string
  subject: string
  date: string
  authorCompany: string
  pages: string
  rdsCode: string
  recordName: string
  department: string
  retentionTrigger: string
  retentionPeriod: string
  reviewYear: string
  retentionStatus: string
  retentionVersion: string
  createdDate: string
  assetRegion: string
}

export function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'N/A'
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => String(item)).join(', ') : 'N/A'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

export function topMatch(classification?: ClassificationResult | null) {
  return classification?.top_matches?.[0] ?? null
}

export function buildDocumentMetadataView({
  details,
  classification,
  assetClassification,
  listItem,
  jobBatch,
  jobLibrary,
}: {
  details?: DocumentDetails | null
  classification?: ClassificationResult | null
  assetClassification?: AssetClassificationResult | null
  listItem?: Document | null
  jobBatch?: string | null
  jobLibrary?: string | null
}): DocumentMetadataView {
  const match = topMatch(classification)
  const retention: RetentionInfo = details?.retention ?? classification?.retention ?? {}
  const confidential: ConfidentialSummary = {
    asset:
      details?.asset ??
      listItem?.asset ??
      classification?.asset ??
      assetClassification?.asset ??
      null,
    confidential:
      details?.confidential ??
      listItem?.confidential ??
      classification?.confidential ??
      assetClassification?.confidential ??
      null,
    confidential_source:
      details?.confidential_source ??
      listItem?.confidential_source ??
      classification?.confidential_source ??
      assetClassification?.confidential_source ??
      null,
    confidential_matched_terms:
      details?.confidential_matched_terms ??
      listItem?.confidential_matched_terms ??
      classification?.confidential_matched_terms ??
      assetClassification?.confidential_matched_terms ??
      null,
    folder_key:
      details?.folder_key ??
      listItem?.folder_key ??
      classification?.folder_key ??
      assetClassification?.folder_key ??
      null,
  }

  return {
    filename:
      classification?.filename ||
      details?.file_name ||
      listItem?.file_name ||
      'N/A',
    creationDate: formatMetadataValue(
      retention.created_date ?? details?.date ?? classification?.date ?? listItem?.date,
    ),
    boxId: formatMetadataValue(jobBatch),
    classificationStatus:
      classification?.classification_status ||
      listItem?.status ||
      'N/A',
    asset: formatMetadataValue(confidential.asset),
    confidential: formatMetadataValue(confidential.confidential),
    confidentialSource: formatMetadataValue(confidential.confidential_source),
    confidentialMatchedTerms: formatMetadataValue(confidential.confidential_matched_terms),
    folderKey: formatMetadataValue(confidential.folder_key),
    filePath: formatMetadataValue(details?.file_path ?? details?.path ?? listItem?.path),
    folderPath: formatMetadataValue(details?.folderpath),
    folder: formatMetadataValue(
      details?.folder ?? classification?.folder ?? listItem?.folder,
    ),
    subFolder: formatMetadataValue(
      details?.sub_folder ?? classification?.sub_folder ?? listItem?.sub_folder,
    ),
    folderStructure: formatMetadataValue(
      details?.folder_structure ??
        [details?.folder ?? classification?.folder, details?.sub_folder ?? classification?.sub_folder]
          .filter(Boolean)
          .join(' / '),
    ),
    dataType: formatMetadataValue(
      details?.data_type ?? classification?.data_type ?? listItem?.data_type,
    ),
    discipline: formatMetadataValue(
      details?.discipline ?? classification?.discipline ?? listItem?.discipline,
    ),
    businessFunction: formatMetadataValue(
      details?.business_function ??
        classification?.business_function ??
        listItem?.business_function,
    ),
    contentType: formatMetadataValue(
      details?.content_type ?? classification?.content_type ?? listItem?.content_type,
    ),
    library: formatMetadataValue(
      jobLibrary ?? details?.library ?? classification?.library ?? listItem?.library,
    ),
    subject: formatMetadataValue(
      details?.subject ?? classification?.subject ?? listItem?.subject,
    ),
    date: formatMetadataValue(
      details?.date ?? classification?.date ?? listItem?.date,
    ),
    authorCompany: formatMetadataValue(
      details?.author_company ?? classification?.author_company ?? listItem?.author_company,
    ),
    pages: formatMetadataValue(details?.pages),
    rdsCode: formatMetadataValue(retention.rds_code ?? match?.record_code),
    recordName: formatMetadataValue(match?.record_name),
    department: formatMetadataValue(match?.department ?? details?.discipline),
    retentionTrigger: formatMetadataValue(retention.trigger),
    retentionPeriod: formatMetadataValue(retention.retention_period),
    reviewYear: formatMetadataValue(retention.review_year),
    retentionStatus: formatMetadataValue(retention.status),
    retentionVersion: formatMetadataValue(retention.version),
    createdDate: formatMetadataValue(retention.created_date),
    assetRegion: formatMetadataValue(retention.asset_region),
  }
}

export function metadataSections(view: DocumentMetadataView): MetadataField[][] {
  return [
    [
      { label: 'filename', value: view.filename },
      { label: 'classification_status', value: view.classificationStatus },
      { label: 'file_path', value: view.filePath },
      { label: 'source_folderpath', value: view.folderPath },
      { label: 'folder', value: view.folder },
      { label: 'sub_folder', value: view.subFolder },
      { label: 'folder_structure', value: view.folderStructure },
      { label: 'folder_key', value: view.folderKey },
      { label: 'pages', value: view.pages },
    ],
    [
      { label: 'asset', value: view.asset },
      { label: 'confidential', value: view.confidential },
      { label: 'confidential_source', value: view.confidentialSource },
      { label: 'confidential_matched_terms', value: view.confidentialMatchedTerms },
      { label: 'data_type', value: view.dataType },
      { label: 'discipline', value: view.discipline },
      { label: 'business_function', value: view.businessFunction },
      { label: 'content_type', value: view.contentType },
      { label: 'library', value: view.library },
      { label: 'subject', value: view.subject },
      { label: 'date', value: view.date },
      { label: 'author_company', value: view.authorCompany },
      { label: 'RDS Code', value: view.rdsCode },
      { label: 'Record Name', value: view.recordName },
      { label: 'Department', value: view.department },
    ],
    [
      { label: 'retention_trigger', value: view.retentionTrigger },
      { label: 'retention_period', value: view.retentionPeriod },
      { label: 'review_year', value: view.reviewYear },
      { label: 'version', value: view.retentionVersion },
      { label: 'retention_status', value: view.retentionStatus },
      { label: 'created_date', value: view.createdDate },
      { label: 'asset_region', value: view.assetRegion },
    ],
  ]
}
