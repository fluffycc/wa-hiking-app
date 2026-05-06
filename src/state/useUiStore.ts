import { create } from 'zustand'

type Tab = 'map' | 'explore' | 'saved'
type BottomSheetState = 'hidden' | 'preview' | 'expanded'

interface UiStore {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
  selectedTrailId: string | null
  setSelectedTrailId: (id: string | null) => void
  bottomSheetState: BottomSheetState
  setBottomSheetState: (s: BottomSheetState) => void
}

export const useUiStore = create<UiStore>((set) => ({
  activeTab: 'map',
  setActiveTab: (activeTab) => set({ activeTab }),
  selectedTrailId: null,
  setSelectedTrailId: (selectedTrailId) => set({
    selectedTrailId,
    bottomSheetState: selectedTrailId ? 'preview' : 'hidden',
  }),
  bottomSheetState: 'hidden',
  setBottomSheetState: (bottomSheetState) => set({ bottomSheetState }),
}))
