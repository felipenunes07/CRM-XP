import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PublicOnlyRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { usePermissions } from "./hooks/usePermissions";
import { useUiLanguage } from "./i18n";

const AppShell = lazy(async () => ({ default: (await import("./components/AppShell")).AppShell }));
const DashboardPage = lazy(async () => ({ default: (await import("./pages/DashboardPage")).DashboardPage }));
const ExecutiveSalesDashboardPage = lazy(async () => ({
  default: (await import("./pages/ExecutiveSalesDashboardPage")).ExecutiveSalesDashboardPage,
}));
const AttendantsPage = lazy(async () => ({ default: (await import("./pages/AttendantsPage")).AttendantsPage }));
const CustomersPage = lazy(async () => ({ default: (await import("./pages/CustomersPage")).CustomersPage }));
const CustomerFinancialPage = lazy(async () => ({
  default: (await import("./pages/CustomerFinancialPage")).CustomerFinancialPage,
}));
const CustomerFinancialDetailPage = lazy(async () => ({
  default: (await import("./pages/CustomerFinancialDetailPage")).CustomerFinancialDetailPage,
}));
const AmbassadorsPage = lazy(async () => ({ default: (await import("./pages/AmbassadorsPage")).AmbassadorsPage }));
const InventoryPage = lazy(async () => ({ default: (await import("./pages/InventoryPage")).InventoryPage }));
const InventoryModelAnalysisPage = lazy(async () => ({
  default: (await import("./pages/InventoryModelAnalysisPage")).InventoryModelAnalysisPage,
}));
const CustomerDetailPage = lazy(async () => ({
  default: (await import("./pages/CustomerDetailPage")).CustomerDetailPage,
}));
const AutomationsPage = lazy(async () => ({ default: (await import("./pages/AutomationsPage")).AutomationsPage }));
const SegmentsPage = lazy(async () => ({ default: (await import("./pages/SegmentsPage")).SegmentsPage }));
const AgendaPage = lazy(async () => ({ default: (await import("./pages/AgendaPage")).AgendaPage }));
const NewCustomersPage = lazy(async () => ({ default: (await import("./pages/NewCustomersPage")).NewCustomersPage }));
const ReactivationPage = lazy(async () => ({ default: (await import("./pages/ReactivationPage")).ReactivationPage }));
const IdeaBoardPage = lazy(async () => ({ default: (await import("./pages/IdeaBoardPage")).IdeaBoardPage }));
const MessagesPage = lazy(async () => ({ default: (await import("./pages/MessagesPage")).MessagesPage }));
const WhatsappActivityPage = lazy(async () => ({ default: (await import("./pages/WhatsappActivityPage")).WhatsappActivityPage }));
const MovementsPage = lazy(async () => ({ default: (await import("./pages/MovementsPage")).MovementsPage }));
const LabelsPage = lazy(async () => ({ default: (await import("./pages/LabelsPage")).LabelsPage }));
const ProspectingPage = lazy(async () => ({ default: (await import("./pages/ProspectingPage")).ProspectingPage }));
const DisparadorPage = lazy(async () => ({ default: (await import("./pages/DisparadorPage")).DisparadorPage }));
const TemplatesPage = lazy(async () => ({ default: (await import("./pages/TemplatesPage")).TemplatesPage }));
const OffboardingPage = lazy(async () => ({ default: (await import("./pages/OffboardingPage")).OffboardingPage }));
const LifecyclePage = lazy(async () => ({ default: (await import("./pages/LifecyclePage")).LifecyclePage }));
const MetasPage = lazy(async () => ({ default: (await import("./pages/MetasPage")).MetasPage }));
const PipelinePage = lazy(async () => ({ default: (await import("./pages/PipelinePage")).PipelinePage }));
const WhatsappConfigPage = lazy(async () => ({ default: (await import("./pages/WhatsappConfigPage")).WhatsappConfigPage }));
const EventsPage = lazy(async () => ({ default: (await import("./pages/EventsPage")).EventsPage }));
const ProductComplaintsPage = lazy(async () => ({ default: (await import("./pages/ProductComplaintsPage")).ProductComplaintsPage }));
const LoginPage = lazy(async () => ({ default: (await import("./pages/LoginPage")).LoginPage }));
const AccessDeniedPage = lazy(async () => ({ default: (await import("./pages/AccessDeniedPage")).AccessDeniedPage }));
const AdminUsersPage = lazy(async () => ({ default: (await import("./pages/AdminUsersPage")).AdminUsersPage }));
const NovidadesPage = lazy(async () => ({ default: (await import("./pages/NovidadesPage")).NovidadesPage }));
const StrategiesPage = lazy(async () => ({ default: (await import("./pages/StrategiesPage")).StrategiesPage }));

function RouteLoadingFallback() {
  const { tx } = useUiLanguage();

  return <div className="page-loading fullscreen">{tx("Carregando tela...", "正在加载页面...")}</div>;
}

function PermissionElement({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { canAccess } = usePermissions();
  if (!canAccess(permission)) {
    return <Navigate to="/acesso-negado" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { tx } = useUiLanguage();

  return (
    <Suspense fallback={<div className="page-loading fullscreen">{tx("Carregando tela...", "正在加载页面...")}</div>}>
      <Routes>
        <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route element={<ProtectedRoute />}>
          <Route
            path="/relatorio-executivo"
            element={<PermissionElement permission="dashboard.view"><ExecutiveSalesDashboardPage /></PermissionElement>}
          />
          <Route element={<AppShell />}>
            <Route path="/acesso-negado" element={<AccessDeniedPage />} />
            <Route path="/" element={<PermissionElement permission="dashboard.view"><DashboardPage /></PermissionElement>} />
            <Route path="/pipeline" element={<PermissionElement permission="commercial.pipeline.view"><PipelinePage /></PermissionElement>} />
            <Route path="/atendentes" element={<PermissionElement permission="reports.attendants.view"><AttendantsPage /></PermissionElement>} />
            <Route path="/clientes" element={<PermissionElement permission="commercial.customers.view"><CustomersPage /></PermissionElement>} />
            <Route path="/clientes/financeiro" element={<PermissionElement permission="finance.customers.view"><CustomerFinancialPage /></PermissionElement>} />
            <Route path="/clientes/financeiro/:id" element={<PermissionElement permission="finance.customers.view"><CustomerFinancialDetailPage /></PermissionElement>} />
            <Route path="/estoque" element={<PermissionElement permission="reports.inventory.view"><InventoryPage /></PermissionElement>} />
            <Route path="/estoque/modelos/:modelKey" element={<PermissionElement permission="reports.inventory.view"><InventoryModelAnalysisPage /></PermissionElement>} />
            <Route path="/embaixadores" element={<PermissionElement permission="commercial.ambassadors.view"><AmbassadorsPage /></PermissionElement>} />
            <Route path="/clientes/:id" element={<PermissionElement permission="commercial.customers.view"><CustomerDetailPage /></PermissionElement>} />
            <Route path="/automacoes" element={<PermissionElement permission="automations.view"><AutomationsPage /></PermissionElement>} />
            <Route path="/segmentos" element={<PermissionElement permission="reports.segments.view"><SegmentsPage /></PermissionElement>} />
            <Route path="/agenda" element={<PermissionElement permission="commercial.agenda.view"><AgendaPage /></PermissionElement>} />
            <Route path="/clientes-novos" element={<PermissionElement permission="commercial.new_customers.view"><NewCustomersPage /></PermissionElement>} />
            <Route path="/reativacao" element={<PermissionElement permission="commercial.reactivation.view"><ReactivationPage /></PermissionElement>} />
            <Route path="/ideias-votacao" element={<PermissionElement permission="commercial.ideas.view"><IdeaBoardPage /></PermissionElement>} />
            <Route path="/mensagens" element={<PermissionElement permission="messages.inbox.view"><MessagesPage /></PermissionElement>} />
            <Route path="/atividade-whatsapp" element={<PermissionElement permission="reports.whatsapp.view"><WhatsappActivityPage /></PermissionElement>} />
            <Route path="/movimentacao" element={<PermissionElement permission="reports.movement.view"><MovementsPage /></PermissionElement>} />
            <Route path="/disparador" element={<PermissionElement permission="messages.broadcast.view"><DisparadorPage /></PermissionElement>} />
            <Route path="/templates" element={<PermissionElement permission="messages.templates.view"><TemplatesPage /></PermissionElement>} />
            <Route path="/saida-base" element={<PermissionElement permission="messages.offboarding.view"><OffboardingPage /></PermissionElement>} />
            <Route path="/automacao-carteira" element={<PermissionElement permission="messages.lifecycle.view"><LifecyclePage /></PermissionElement>} />
            <Route path="/rotulos" element={<PermissionElement permission="commercial.labels.view"><LabelsPage /></PermissionElement>} />
            <Route path="/prospeccao" element={<PermissionElement permission="commercial.prospecting.view"><ProspectingPage /></PermissionElement>} />
            <Route path="/metas" element={<PermissionElement permission="finance.goals.view"><MetasPage /></PermissionElement>} />
            <Route path="/eventos" element={<PermissionElement permission="messages.events.view"><EventsPage /></PermissionElement>} />
            <Route path="/reclamacoes-produto" element={<PermissionElement permission="messages.complaints.view"><ProductComplaintsPage /></PermissionElement>} />
            <Route path="/usuarios" element={<PermissionElement permission="integrations.whatsapp.view"><WhatsappConfigPage /></PermissionElement>} />
            <Route path="/admin/usuarios" element={<PermissionElement permission="admin.users.manage"><AdminUsersPage /></PermissionElement>} />
            <Route path="/config/whatsapp" element={<PermissionElement permission="integrations.whatsapp.view"><WhatsappConfigPage /></PermissionElement>} />
            <Route path="/novidades" element={<PermissionElement permission="changelog.view"><NovidadesPage /></PermissionElement>} />
            <Route path="/estrategias" element={<PermissionElement permission="reports.strategies.view"><StrategiesPage /></PermissionElement>} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
