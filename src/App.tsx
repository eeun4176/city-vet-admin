import { lazy, Suspense, type ReactElement, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { landingPageForRole, type Capability } from '../shared/permissions';
import { AppShell } from './components/AppShell';
import { LocaleProvider, useT } from './i18n';
import { useAuth } from './lib/auth';
import { flatten, NAV } from './nav/nav';
import { MaintenancePage, NotFoundPage, PendingPage } from './pages/StatusPages';
import { Loading } from './components/ui';

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage }))); 
const CalendarPage = lazy(() => import('./pages/CalendarPage').then(module => ({ default: module.CalendarPage })));
const InboxPage = lazy(() => import('./pages/InboxPage').then((module) => ({ default: module.InboxPage }))); 
const RecordsPage = lazy(() => import('./pages/RecordsPage').then((module) => ({ default: module.RecordsPage }))); 
const RegistryPage = lazy(() => import('./pages/RegistryPage').then((module) => ({ default: module.RegistryPage })));
const FieldRecordsPage = lazy(() => import('./pages/FieldRecordsPage').then((module) => ({ default: module.FieldRecordsPage })));
const RecordPreviewPage = lazy(() => import('./pages/RecordPreviewPage').then((module) => ({ default: module.RecordPreviewPage })));
const DataManagementPage = lazy(() => import('./pages/DataManagementPage').then((module) => ({ default: module.DataManagementPage }))); 
const AuditPage = lazy(() => import('./pages/InsightsPages').then((module) => ({ default: module.AuditPage }))); 
const DataQualityPage = lazy(() => import('./pages/DataQualityPage').then((module) => ({ default: module.DataQualityPage })));
const ReportsPage = lazy(() => import('./pages/InsightsReportsPage').then((module) => ({ default: module.ReportsPage })));
const BarangaysPage = lazy(() => import('./pages/ReferencePages').then((module) => ({ default: module.BarangaysPage }))); 
const ProgramInterestPage = lazy(() => import('./pages/ProgramInterestPage').then((module) => ({ default: module.ProgramInterestPage }))); 
const StubWorkflowPage = lazy(() => import('./pages/StubWorkflowPage').then((module) => ({ default: module.StubWorkflowPage }))); 
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage }))); 
const CensusFormPage = lazy(() => import('./pages/census/CensusFormPage').then((module) => ({ default: module.CensusFormPage }))); 
const CensusImportPage = lazy(() => import('./pages/census/CensusImportPage').then((module) => ({ default: module.CensusImportPage }))); 
const CensusFrontPage = lazy(() => import('./pages/census/CensusReports').then((module) => ({ default: module.CensusFrontPage }))); 
const CensusSummaryPage = lazy(() => import('./pages/census/CensusReports').then((module) => ({ default: module.CensusSummaryPage }))); 
const SubmissionDetailPage = lazy(() => import('./pages/census/SubmissionDetailPage').then((module) => ({ default: module.SubmissionDetailPage }))); 
const MySubmissionsPage = lazy(() => import('./pages/census/SubmissionLists').then((module) => ({ default: module.MySubmissionsPage }))); 
const ReviewListPage = lazy(() => import('./pages/census/SubmissionLists').then((module) => ({ default: module.ReviewListPage }))); 
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage }))); 
const AccountPage = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })));
const AccountsPage = lazy(() => import('./pages/AccountsPage').then((module) => ({ default: module.AccountsPage }))); 
const AccessHubPage = lazy(() => import('./pages/WorkflowPages').then((module) => ({ default: module.AccessHubPage }))); 
const AccessRequestsPage = lazy(() => import('./pages/WorkflowPages').then((module) => ({ default: module.AccessRequestsPage }))); 
const IssuesPage = lazy(() => import('./pages/WorkflowPages').then((module) => ({ default: module.IssuesPage }))); 
const NewIssuePage = lazy(() => import('./pages/WorkflowPages').then((module) => ({ default: module.NewIssuePage }))); 
const ProgramWorkspacePage = lazy(() => import('./pages/ProgramWorkspacePage').then((module) => ({ default: module.ProgramWorkspacePage })));
const programWorkspace = <Suspense fallback={<Loading label="Loading Program workspace…" />}><ProgramWorkspacePage /></Suspense>;

/** Screens that exist. Every other menu URL shows a neutral "being built" page until its module ships. */
const BUILT: Record<string, ReactElement> = {
  '/dashboard': <DashboardPage />,
  '/registry/owners': <RegistryPage key="owners" kind="owners" />,
  '/registry/pets': <RegistryPage key="pets" kind="pets" />,
  '/registry/respondents': <FieldRecordsPage key="respondents" kind="respondents" />,
  '/registry/participants': <FieldRecordsPage key="participants" kind="participants" />,
  '/paravets': <RecordsPage dataset="paravets" title="Paravets" writeCap="paravets.manage" />,
  '/accounts': <AccountsPage />,
  '/program-interest': <ProgramInterestPage />,
  '/barangays': <BarangaysPage />,
  '/programs': programWorkspace,
  '/program-day': programWorkspace,
  '/stubs': <StubWorkflowPage initialTab="batches" />,
  '/services': <FieldRecordsPage key="services" kind="services" />,
  '/import-export': <DataManagementPage />,
  '/reports': <ReportsPage />,
  '/data-quality': <DataQualityPage />,
  '/audit': <AuditPage />,
  '/settings': <SettingsPage />,
  '/access': <AccessHubPage />,
  '/access/requests': <AccessRequestsPage />,
  '/issues': <IssuesPage />,
  '/issues/new': <NewIssuePage />,
  '/census/new': <CensusFormPage />,
  '/census/import': <CensusImportPage />,
  '/census/mine': <MySubmissionsPage />,
  '/census/review/pending': <ReviewListPage status="pending" />,
  '/census/review/approved': <ReviewListPage status="approved" />,
  '/census/review/rejected': <ReviewListPage status="rejected" />,
  '/census/summary': <CensusSummaryPage />,
  '/census/front-page': <CensusFrontPage />,
};

function Protected({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const { t } = useT();
  if (status === 'loading') return <Loading />;
  if (status === 'maintenance') return <MaintenancePage />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { account } = useAuth();
  return <Navigate to={account ? landingPageForRole(account.type) : '/login'} replace />;
}

/** Typing the address of a page the account may not open, or of a feature switched off for its account type, shows "No access" instead of the page. The API refuses the data either way. */
function RequireCapability({ cap, features = [], children }: { cap?: Capability; features?: (string | undefined)[]; children: ReactElement }) {
  const { account, can, featureEnabled } = useAuth();
  if (!account) return <Navigate to="/login" replace />;
  return (!cap || can(cap)) && features.every((feature) => featureEnabled(feature)) ? children : <NotFoundPage noAccess />;
}

const routes = flatten(NAV.flatMap((section) => section.nodes)).filter(({ node }) => node.to);

export function App() {
  const { account, setLocale } = useAuth();
  return (
    <LocaleProvider key={account?.id ?? 'anonymous'} preferred={account?.locale} onChange={setLocale}>
      <Suspense fallback={<Loading label="Loading page…" />}><Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Protected><AppShell /></Protected>}>
          <Route index element={<HomeRedirect />} />
          {routes.map(({ node, ancestors }) => (
            <Route key={node.id} path={node.to} element={<RequireCapability cap={node.cap} features={[node.feature, ...ancestors.map((a) => a.feature)]}>{BUILT[node.to!] ?? <PendingPage />}</RequireCapability>} />
          ))}
          <Route path="/census/mine/:id" element={<RequireCapability cap="census.submit" features={['census']}><SubmissionDetailPage /></RequireCapability>} />
          <Route path="/records/view" element={<RecordPreviewPage />} />
          <Route path="/calendar" element={<RequireCapability cap="program_day.manage"><CalendarPage /></RequireCapability>} />
          <Route path="/census/mine/:id/edit" element={<RequireCapability cap="census.submit" features={['census']}><CensusFormPage /></RequireCapability>} />
          <Route path="/census/review/:status/:id" element={<RequireCapability cap="census.review" features={['census']}><SubmissionDetailPage /></RequireCapability>} />
          <Route path="/settings" element={BUILT['/settings']} />
          <Route path="/account" element={<AccountPage />} />
          {/* No longer in the sidebar (Paravets are managed under Paravets); kept so search results and old links still open. */}
          <Route path="/accounts" element={<RequireCapability cap="accounts.manage_portal">{BUILT['/accounts']}</RequireCapability>} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/stubs/legacy" element={<RequireCapability cap="registry.write"><RecordsPage dataset="stubs" title="Historical stub records" readOnly /></RequireCapability>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes></Suspense>
    </LocaleProvider>
  );
}
