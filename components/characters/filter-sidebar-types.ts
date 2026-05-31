import type {
  AlignmentCount,
  CharacterFilterTab,
  OriginCount,
  SortOrder,
  TraitCount,
} from '@/types/character'

export interface FilterSidebarTabModel {
  value: CharacterFilterTab
  onChange: (tab: CharacterFilterTab) => void
}

export interface FilterSidebarSortModel {
  value: SortOrder
  onChange: (sort: SortOrder) => void
}

export interface FilterSidebarSearchModel {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}

export type FilterSidebarToggleId = 'hasSheet' | 'hasElizaProfile'

export interface FilterSidebarToggleModel {
  id: FilterSidebarToggleId
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  title?: string
}

export interface FilterSidebarOriginDropdownModel {
  id: 'origin'
  kind: 'origin'
  value: string | null
  options: OriginCount[]
  onChange: (value: string | null) => void
  isLoading: boolean
}

export interface FilterSidebarAlignmentDropdownModel {
  id: 'alignment'
  kind: 'alignment'
  value: string | null
  options: AlignmentCount[]
  onChange: (value: string | null) => void
  isLoading: boolean
}

export type FilterSidebarTraitDropdownId = 'the17' | 'armor' | 'back' | 'mask'

export interface FilterSidebarTraitDropdownModel {
  id: FilterSidebarTraitDropdownId
  kind: 'trait'
  label: string
  value: string | null
  options: TraitCount[]
  onChange: (value: string | null) => void
  isLoading: boolean
}

export type FilterSidebarDropdownModel =
  | FilterSidebarOriginDropdownModel
  | FilterSidebarAlignmentDropdownModel
  | FilterSidebarTraitDropdownModel

export interface FilterSidebarTraitGroupsModel {
  primary: FilterSidebarDropdownModel[]
  equipment: FilterSidebarTraitDropdownModel[]
}

export interface FilterSidebarModel {
  tab: FilterSidebarTabModel
  sort: FilterSidebarSortModel
  search: FilterSidebarSearchModel
  toggles: FilterSidebarToggleModel[]
  traitGroups: FilterSidebarTraitGroupsModel
  totalCount: number
  onClearAllFilters: () => void
}

export function getFilterSidebarActiveCount(model: FilterSidebarModel) {
  const activeToggleCount = model.toggles.filter((toggle) => toggle.checked).length
  const activePrimaryTraitCount = model.traitGroups.primary.filter((filter) => filter.value !== null).length
  const activeEquipmentTraitCount = model.traitGroups.equipment.filter((filter) => filter.value !== null).length
  const activeSearchCount = model.search.value.length > 0 ? 1 : 0

  return activeToggleCount + activePrimaryTraitCount + activeEquipmentTraitCount + activeSearchCount
}
