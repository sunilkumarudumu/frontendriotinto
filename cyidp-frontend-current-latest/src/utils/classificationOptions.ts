export const ARCHIVE_FOLDERS = [
  'Historical',
  'Legal',
  'Project Management',
  'Regulatory',
  'Site HSEQ MS',
  'Unnecessary Files',
] as const

export const SUB_FOLDERS_BY_FOLDER: Record<string, string[]> = {
  Legal: ['Contracts', 'Court Documents', 'Communications'],
  'Project Management': [
    'Closure',
    'Communications',
    'Finance',
    'Insurance',
    'Measuring-Monitoring',
    'Royalties',
    'Waste',
    'Work Plans',
  ],
}

export const DATA_TYPE_VALUES = [
  'Account',
  'Acquisition',
  'Afforestation',
  'Agency Communications/Submittals',
  'Agreement',
  'Bill of Sale',
  'Borehole',
  'Buildings',
  'Cadastral',
  'Certificate of Analysis',
  'Claim',
  'Community Relations',
  'Contract',
  'Correspondence',
  'Cultural Heritage Record',
  'Data',
  'Deed',
  'Divestment',
  'Drawing',
  'Drill Hole',
  'Grant',
  'Hazardous Materials Register',
  'Incident',
  'Incident - Managed Long Term Effects',
  'Insurance',
  'Joint Venture',
  'Land Access',
  'Leachability',
  'Licenses, Certificates, and Permits',
  'Litigation',
  'Mapping',
  'Medical Record',
  'Monitoring',
  'Payment',
  'Photo',
  'Plan',
  'Procedure',
  'Process Diagram',
  'Processing Policy, Standards, Procedures',
  'Property',
  'Publication',
  'Pump Test Data',
  'Quitclaim Deed',
  'Relinquishment',
  'Remedial Investigation',
  'Report',
  'Risk Assessments and Registers',
  'Royalty',
  'Safety Data Sheet',
  'Survey',
  'Tailings',
  'Tax Record',
  'Waste',
  'Utilities',
] as const

export const DISCIPLINE_VALUES = [
  'Acid Rock Drainage and Metal Leaching (ARD & ML)',
  'Administration',
  'Agriculture',
  'Aquatics',
  'Archeology',
  'Biology',
  'Community',
  'Design',
  'Ecology',
  'Engineering',
  'Environmental',
  'Finance',
  'Geologic',
  'Health & Safety',
  'Human Resources',
  'Hydrology/Hydrogeology',
  'Infrastructure',
  'Land',
  'Legal',
  'Limnology',
  'Logistics',
  'Toxicology',
  'Vegetation',
  'Water Balance/Modeling',
  'Water Treatment',
  'Wildlife',
] as const

export const BUSINESS_FUNCTION_VALUES = [
  'Asset Management',
  'CSP',
  'Environmental',
  'Finance',
  'HR',
  'HSE',
  'Legal',
  'Major Hazards',
] as const

export const CONTENT_TYPE_VALUES = [
  'Contract',
  'Data',
  'Image',
  'Invoice',
  'Plan',
  'Procedure',
  'Report',
  'Standard',
  'Submittal',
] as const

export type LibraryPreset = 'Archive' | 'Project'

export function subFoldersFor(folder: string): string[] {
  return SUB_FOLDERS_BY_FOLDER[folder] ?? []
}

export function isProjectLibrary(library?: string | null): boolean {
  return String(library || '').trim().toLowerCase() === 'project'
}
