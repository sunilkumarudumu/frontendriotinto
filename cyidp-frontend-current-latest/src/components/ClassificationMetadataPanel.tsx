import type { TopMatch } from '../api/client'
import {
  ARCHIVE_FOLDERS,
  BUSINESS_FUNCTION_VALUES,
  CONTENT_TYPE_VALUES,
  DATA_TYPE_VALUES,
  DISCIPLINE_VALUES,
  subFoldersFor,
  type LibraryPreset,
} from '../utils/classificationOptions'
import { formatMetadataValue } from '../utils/documentMetadata'

type FieldProps = {
  label: string
  value: string
  readOnly?: boolean
  onChange?: (value: string) => void
  options?: readonly string[]
}

function MetadataField({ label, value, readOnly = true, onChange, options }: FieldProps) {
  if (!readOnly && options) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="font-ui text-[11px] font-bold text-[#1f1f1f]">{label}</label>
        <select
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className="w-full rounded-[3px] border border-[#d0d0d0] bg-white px-2 py-1.5 font-ui text-[11px] text-[#2f2f2f] focus:border-cy-teal focus:outline-none"
        >
          <option value="">Select {label}</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
    )
  }

  if (!readOnly) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="font-ui text-[11px] font-bold text-[#1f1f1f]">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className="w-full rounded-[3px] border border-[#d0d0d0] bg-white px-2 py-1.5 font-ui text-[11px] text-[#2f2f2f] focus:border-cy-teal focus:outline-none"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[10px] font-bold uppercase tracking-wide text-[#666666]">{label}</span>
      <span className="font-ui text-[11px] text-[#1f1f1f] break-words">{formatMetadataValue(value)}</span>
    </div>
  )
}

export type ClassificationReviewValues = {
  folder: string
  subFolder: string
  dataType: string
  discipline: string
  businessFunction: string
  contentType: string
  subject: string
  date: string
  authorCompany: string
  classificationStatus: string
  selectedRdsCode: string
}

export type ReviewLibraryMode = LibraryPreset

type ClassificationMetadataPanelProps = {
  values: ClassificationReviewValues
  topMatches?: TopMatch[]
  readOnly?: boolean
  libraryMode?: ReviewLibraryMode
  onChange?: (field: keyof ClassificationReviewValues, value: string) => void
  onRdsSelect?: (recordCode: string) => void
}

const RANK_COLORS = ['#06A77D', '#F2994A', '#EF2B3B']

export default function ClassificationMetadataPanel({
  values,
  topMatches = [],
  readOnly = true,
  libraryMode = 'Archive',
  onChange,
  onRdsSelect,
}: ClassificationMetadataPanelProps) {
  const subFolderOptions = subFoldersFor(values.folder)
  const isProject = libraryMode === 'Project'

  return (
    <div className="space-y-4">
      <MetadataField
        label="Classification Status"
        value={values.classificationStatus}
        readOnly={readOnly}
        onChange={(value) => onChange?.('classificationStatus', value)}
      />

      <MetadataField
        label="Folder"
        value={values.folder}
        readOnly={readOnly}
        options={ARCHIVE_FOLDERS}
        onChange={(value) => onChange?.('folder', value)}
      />
      <MetadataField
        label="Subfolder"
        value={values.subFolder}
        readOnly={readOnly || subFolderOptions.length === 0}
        options={subFolderOptions}
        onChange={(value) => onChange?.('subFolder', value)}
      />

      {isProject ? (
        <>
          <MetadataField
            label="Business Function"
            value={values.businessFunction}
            readOnly={readOnly}
            options={BUSINESS_FUNCTION_VALUES}
            onChange={(value) => onChange?.('businessFunction', value)}
          />
          <MetadataField
            label="Content Type"
            value={values.contentType}
            readOnly={readOnly}
            options={CONTENT_TYPE_VALUES}
            onChange={(value) => onChange?.('contentType', value)}
          />
        </>
      ) : (
        <>
          <MetadataField
            label="Data Type"
            value={values.dataType}
            readOnly={readOnly}
            options={DATA_TYPE_VALUES}
            onChange={(value) => onChange?.('dataType', value)}
          />
          <MetadataField
            label="Discipline"
            value={values.discipline}
            readOnly={readOnly}
            options={DISCIPLINE_VALUES}
            onChange={(value) => onChange?.('discipline', value)}
          />
        </>
      )}

      <MetadataField
        label="Subject"
        value={values.subject}
        readOnly={readOnly}
        onChange={(value) => onChange?.('subject', value)}
      />
      <MetadataField
        label="Date"
        value={values.date}
        readOnly={readOnly}
        onChange={(value) => onChange?.('date', value)}
      />

      {!isProject && (
        <MetadataField
          label="Author / Company"
          value={values.authorCompany}
          readOnly={readOnly}
          onChange={(value) => onChange?.('authorCompany', value)}
        />
      )}

      <div className="flex flex-col gap-2 border-t border-[#e8e8e8] pt-4">
        <span className="font-ui text-[11px] font-bold text-[#1f1f1f]">RDS Code</span>
        {readOnly ? (
          <span className="font-ui text-[11px] text-[#1f1f1f]">{formatMetadataValue(values.selectedRdsCode)}</span>
        ) : (
          <select
            value={values.selectedRdsCode}
            onChange={(event) => onRdsSelect?.(event.target.value)}
            className="w-full rounded-[3px] border border-[#d0d0d0] bg-white px-2 py-1.5 font-ui text-[11px] text-[#2f2f2f] focus:border-cy-teal focus:outline-none"
          >
            <option value="">Select RDS code</option>
            {topMatches.map((match) => (
              <option key={match.record_code} value={match.record_code}>
                {match.record_code} - {match.record_name}
              </option>
            ))}
          </select>
        )}

        {topMatches.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {topMatches.map((match, index) => (
              <button
                key={`${match.record_code}-${index}`}
                type="button"
                disabled={readOnly}
                onClick={() => onRdsSelect?.(match.record_code)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-white transition-opacity disabled:cursor-default"
                style={{
                  backgroundColor: RANK_COLORS[index] ?? RANK_COLORS[0],
                  opacity: values.selectedRdsCode === match.record_code ? 1 : 0.55,
                }}
              >
                <span className="h-2 w-2 rounded-full bg-white" />
                <span className="font-ui text-[10px] font-semibold">{match.record_code}</span>
              </button>
            ))}
          </div>
        )}

        {topMatches[0] && (
          <div className="rounded-[4px] bg-[#f8fafc] border border-[#e2e8f0] p-2 space-y-1">
            <p className="font-ui text-[10px] text-[#666666]">Record: {topMatches[0].record_name}</p>
            <p className="font-ui text-[10px] text-[#666666]">Department: {topMatches[0].department}</p>
            <p className="font-ui text-[10px] text-[#666666]">
              Confidence: {Math.round((topMatches[0].confidence ?? 0) * 100)}%
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
