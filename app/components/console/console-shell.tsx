"use client";

import { useState } from "react";
import {
  ConsoleProvider,
  useConsole,
  type ConsoleTab,
} from "../../lib/console/console-context";
import { useConfig } from "../../lib/lottery/accounts";
import { useIsAdmin } from "../../lib/lottery/admin";
import { ActivityFeedPanel } from "./activity/activity-feed-panel";
import { ConfigEditorPanel } from "./admin/config-editor-panel";
import { ConfigOverviewPanel } from "./admin/config-overview-panel";
import { PauseEmergencyToggles } from "./admin/pause-emergency-toggles";
import { EmergencyBanner } from "./banners/emergency-banner";
import { PauseBanner } from "./banners/pause-banner";
import { EmergencyPanel } from "./emergency/emergency-panel";
import { LpPanel } from "./lp/lp-panel";
import { OperationsPanel } from "./operations/operations-panel";
import { PrizePoolBreakdown } from "./overview/prize-pool-breakdown";
import { RoundLifecyclePanel } from "./overview/round-lifecycle-panel";
import { RoundOverviewPanel } from "./overview/round-overview-panel";
import { RoundsHistoryList } from "./overview/rounds-history-list";
import { TierTable } from "./overview/tier-table";
import { PlayerPanel } from "./player/player-panel";
import { ReferralPanel } from "./referral/referral-panel";
import { useCurrentRound } from "../../lib/lottery/accounts";
import { SubscriptionPanel } from "./subscription/subscription-panel";
import { useMint } from "../../lib/lottery/tokens";
import { PanelGroup } from "./shared";

const ALL_TABS: { id: ConsoleTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "player", label: "Player" },
  { id: "lp", label: "LP" },
  { id: "referral", label: "Referral" },
  { id: "subscription", label: "Subscription" },
  { id: "operations", label: "Operations" },
  { id: "admin", label: "Admin" },
  { id: "emergency", label: "Emergency" },
  { id: "activity", label: "Activity" },
];

function TabNav() {
  const { activeTab, setActiveTab } = useConsole();
  const isAdmin = useIsAdmin();
  const { config } = useConfig();
  const visibleTabs = ALL_TABS.filter((t) => {
    if (t.id === "admin" && !isAdmin && config) return false;
    return true;
  });
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border-low pb-2 text-xs">
      {visibleTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`rounded-md px-3 py-1.5 font-semibold transition ${
            activeTab === tab.id
              ? "bg-primary text-primary-foreground"
              : "text-muted hover:bg-cream hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function OverviewTab() {
  const { config } = useConfig();
  const { decimals } = useMint(config?.paymentMint);
  const { round } = useCurrentRound();
  return (
    <PanelGroup>
      <RoundOverviewPanel />
      <RoundLifecyclePanel
        round={round}
        paymentMint={config?.paymentMint}
        decimals={decimals}
      />
      <PrizePoolBreakdown
        round={round}
        paymentMint={config?.paymentMint}
        decimals={decimals}
      />
      <TierTable
        round={round}
        config={config}
        paymentMint={config?.paymentMint}
        decimals={decimals}
      />
      <RoundsHistoryList />
    </PanelGroup>
  );
}

function AdminTab() {
  return (
    <PanelGroup>
      <ConfigOverviewPanel />
      <PauseEmergencyToggles />
      <ConfigEditorPanel />
    </PanelGroup>
  );
}

// Mount each tab once on first visit and keep it alive. Inactive tabs are
// hidden via `display: none` so React state, form inputs, scroll position and
// SWR subscriptions persist across tab switches instead of remounting.
function TabPane({
  tab,
  active,
  visited,
  children,
}: {
  tab: ConsoleTab;
  active: ConsoleTab;
  visited: Set<ConsoleTab>;
  children: React.ReactNode;
}) {
  if (!visited.has(tab)) return null;
  return <div hidden={active !== tab}>{children}</div>;
}

function ActiveTabContent() {
  const { activeTab } = useConsole();
  const isAdmin = useIsAdmin();
  const { config } = useConfig();
  const showAdmin = isAdmin || !config;

  const [visited, setVisited] = useState<Set<ConsoleTab>>(
    () => new Set([activeTab])
  );
  if (!visited.has(activeTab)) {
    setVisited((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }

  return (
    <>
      <TabPane tab="overview" active={activeTab} visited={visited}>
        <OverviewTab />
      </TabPane>
      <TabPane tab="player" active={activeTab} visited={visited}>
        <PlayerPanel />
      </TabPane>
      <TabPane tab="lp" active={activeTab} visited={visited}>
        <LpPanel />
      </TabPane>
      <TabPane tab="referral" active={activeTab} visited={visited}>
        <ReferralPanel />
      </TabPane>
      <TabPane tab="subscription" active={activeTab} visited={visited}>
        <SubscriptionPanel />
      </TabPane>
      <TabPane tab="operations" active={activeTab} visited={visited}>
        <OperationsPanel />
      </TabPane>
      {showAdmin && (
        <TabPane tab="admin" active={activeTab} visited={visited}>
          <AdminTab />
        </TabPane>
      )}
      <TabPane tab="emergency" active={activeTab} visited={visited}>
        <EmergencyPanel />
      </TabPane>
      <TabPane tab="activity" active={activeTab} visited={visited}>
        <ActivityFeedPanel />
      </TabPane>
    </>
  );
}

function ConsoleShellInner() {
  return (
    <div className="grid gap-4">
      <PauseBanner />
      <EmergencyBanner />
      <TabNav />
      <ActiveTabContent />
    </div>
  );
}

export function ConsoleShell() {
  return (
    <ConsoleProvider>
      <ConsoleShellInner />
    </ConsoleProvider>
  );
}
