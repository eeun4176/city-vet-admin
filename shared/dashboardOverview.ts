export type DashboardWork = { id: string; title: string; description: string; count: number; to: string };
export type DashboardProgram = {
  id: number; title: string; date: string; startTime: string; endTime: string;
  location: string; barangay: string; status: string; to: string;
};
export type DashboardOverview = {
  tasks: DashboardWork[]; waiting: DashboardWork[];
  programs: DashboardProgram[]; programsHasMore: boolean; programsEnabled: boolean;
  today: string; updatedAt: string;
};
/** Priority lists are intersected with the currently permitted navigation. */
export const dashboardShortcutIds = (role: string) => role === 'Paravet'
  ? ['census-submit', 'census-import', 'program-interest', 'stubs', 'program-day', 'owners']
  : ['owners', 'pets', 'program-day', 'services', 'reports', 'census-pending'];
