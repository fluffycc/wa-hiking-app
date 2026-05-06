import { create } from 'zustand'

interface SavedStore {
  savedTrailIds: string[]
  toggleSaved: (id: string) => void
  isSaved: (id: string) => boolean
  myPasses: { discoverPass: boolean; nwForestPass: boolean }
  setPass: (pass: 'discoverPass' | 'nwForestPass', value: boolean) => void
}

export const useSavedStore = create<SavedStore>((set, get) => ({
  savedTrailIds: [],
  toggleSaved: (id) => set((s) => ({
    savedTrailIds: s.savedTrailIds.includes(id)
      ? s.savedTrailIds.filter((x) => x !== id)
      : [...s.savedTrailIds, id],
  })),
  isSaved: (id) => get().savedTrailIds.includes(id),
  myPasses: { discoverPass: false, nwForestPass: false },
  setPass: (pass, value) => set((s) => ({ myPasses: { ...s.myPasses, [pass]: value } })),
}))
