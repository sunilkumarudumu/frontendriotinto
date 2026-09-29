import type { DocumentMetadataView } from '../utils/documentMetadata'
import { isProjectLibrary } from '../utils/classificationOptions'

type SummaryItem = {
  label: string
  value: string
}

function itemsFromView(view: DocumentMetadataView): SummaryItem[] {
  const projectLibrary = isProjectLibrary(view.library)

  if (projectLibrary) {
    return [
      { label: 'Filename', value: view.filename },
      { label: 'Asset', value: view.asset },
      { label: 'Creation Date', value: view.creationDate },
      { label: 'Business Function', value: view.businessFunction },
      { label: 'Content Type', value: view.contentType },
      { label: 'BCS Code', value: view.rdsCode },
      { label: 'Trigger', value: view.retentionTrigger },
      { label: 'Retention Period', value: view.retentionPeriod },
      { label: 'Review Year', value: view.reviewYear },
    ]
  }

  return [
    { label: 'Filename', value: view.filename },
    { label: 'Asset', value: view.asset },
    { label: 'Creation Date', value: view.creationDate },
    { label: 'Confidential', value: view.confidential },
    { label: 'Discipline', value: view.discipline },
    { label: 'Data Type', value: view.dataType },
    { label: 'Author/Company', value: view.authorCompany },
    { label: 'Box ID', value: view.boxId },
    { label: 'BCS Code', value: view.rdsCode },
    { label: 'Trigger', value: view.retentionTrigger },
    { label: 'Retention Period', value: view.retentionPeriod },
    { label: 'Review Year', value: view.reviewYear },
  ]
}

export default function MetadataSummaryBar({ view }: { view: DocumentMetadataView | null }) {
  if (!view) return null

  const items = itemsFromView(view)
  const columnCount = isProjectLibrary(view.library) ? 9 : 12

  return (
    <div
      className="grid shrink-0 grid-cols-2 gap-2 rounded-[6px] border border-[#d0d0d0] bg-white p-3 md:grid-cols-4 xl:grid-cols-6"
      style={{ gridTemplateColumns: `repeat(${Math.min(columnCount, 6)}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="font-ui text-[10px] font-bold uppercase tracking-wide text-[#666666]">{item.label}</p>
          <p className="truncate font-ui text-[11px] text-[#1f1f1f]" title={item.value}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}
