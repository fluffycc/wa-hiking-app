import { useUiStore } from '../state/useUiStore'
import { MapPage } from '../pages/MapPage'
import { ExploreListPage } from '../pages/ExploreListPage'
import { SavedPage } from '../pages/SavedPage'
import { FeedbackButton } from '../components/feedback/FeedbackButton'

type Tab = 'map' | 'explore' | 'saved'

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'map',     icon: '🗺',  label: 'Map'     },
  { key: 'explore', icon: '🔍',  label: 'Explore' },
  { key: 'saved',   icon: '❤️',  label: 'Saved'   },
]

export function AppShell() {
  const { activeTab, setActiveTab } = useUiStore()

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-trail-bg">
      {/* Page content */}
      <div className="flex-1 overflow-hidden relative">
        <div className={activeTab === 'map'     ? 'block h-full' : 'hidden'}><MapPage /></div>
        <div className={activeTab === 'explore' ? 'block h-full' : 'hidden'}><ExploreListPage /></div>
        <div className={activeTab === 'saved'   ? 'block h-full' : 'hidden'}><SavedPage /></div>
      </div>

      {/* Feedback button */}
      <FeedbackButton />

      {/* Bottom tab bar */}
      <nav className="flex-shrink-0 bg-white border-t border-gray-100 safe-area-bottom">
        <div className="flex">
          {TABS.map(tab => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors
                  ${active ? 'text-trail-green' : 'text-trail-stone hover:text-trail-dark'}`}
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                <span className={`text-[10px] font-body font-medium ${active ? 'text-trail-green' : ''}`}>
                  {tab.label}
                </span>
                {active && <div className="absolute bottom-0 w-8 h-0.5 bg-trail-green rounded-full" />}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
