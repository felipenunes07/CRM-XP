import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PublicOnlyRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { usePermissions } from "./hooks/usePermissions";
import { useUiLanguage } from "./i18n";
const AppShell = lazy(async () => ({ default: (await import("./components/AppShell")).AppShell }));
const DashboardPage = lazy(async () => ({ default: (await import("./pages/DashboardPage")).DashboardPage }));
const AttendantsPage = lazy(async () => ({ default: (await import("./pages/AttendantsPage")).AttendantsPage }));
const CustomersPage = lazy(async () => ({ default: (await import("./pages/CustomersPage")).CustomersPage }));
const CustomerFinancialPage = lazy(async () => ({
    default: (await import("./pages/CustomerFinancialPage")).CustomerFinancialPage,
}));
const AmbassadorsPage = lazy(async () => ({ default: (await import("./pages/AmbassadorsPage")).AmbassadorsPage }));
const InventoryPage = lazy(async () => ({ default: (await import("./pages/InventoryPage")).InventoryPage }));
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
const MetasPage = lazy(async () => ({ default: (await import("./pages/MetasPage")).MetasPage }));
const PipelinePage = lazy(async () => ({ default: (await import("./pages/PipelinePage")).PipelinePage }));
const WhatsappConfigPage = lazy(async () => ({ default: (await import("./pages/WhatsappConfigPage")).WhatsappConfigPage }));
const EventsPage = lazy(async () => ({ default: (await import("./pages/EventsPage")).EventsPage }));
const LoginPage = lazy(async () => ({ default: (await import("./pages/LoginPage")).LoginPage }));
const AccessDeniedPage = lazy(async () => ({ default: (await import("./pages/AccessDeniedPage")).AccessDeniedPage }));
const AdminUsersPage = lazy(async () => ({ default: (await import("./pages/AdminUsersPage")).AdminUsersPage }));
const NovidadesPage = lazy(async () => ({ default: (await import("./pages/NovidadesPage")).NovidadesPage }));
const StrategiesPage = lazy(async () => ({ default: (await import("./pages/StrategiesPage")).StrategiesPage }));
function RouteLoadingFallback() {
    const { tx } = useUiLanguage();
    return _jsx("div", { className: "page-loading fullscreen", children: tx("Carregando tela...", "正在加载页面...") });
}
function PermissionElement({ permission, children }) {
    const { canAccess } = usePermissions();
    if (!canAccess(permission)) {
        return _jsx(Navigate, { to: "/acesso-negado", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
export default function App() {
    const { tx } = useUiLanguage();
    return (_jsx(Suspense, { fallback: _jsx("div", { className: "page-loading fullscreen", children: tx("Carregando tela...", "正在加载页面...") }), children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(PublicOnlyRoute, { children: _jsx(LoginPage, {}) }) }), _jsx(Route, { element: _jsx(ProtectedRoute, {}), children: _jsxs(Route, { element: _jsx(AppShell, {}), children: [_jsx(Route, { path: "/acesso-negado", element: _jsx(AccessDeniedPage, {}) }), _jsx(Route, { path: "/", element: _jsx(PermissionElement, { permission: "dashboard.view", children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/pipeline", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(PipelinePage, {}) }) }), _jsx(Route, { path: "/atendentes", element: _jsx(PermissionElement, { permission: "reports.view", children: _jsx(AttendantsPage, {}) }) }), _jsx(Route, { path: "/clientes", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(CustomersPage, {}) }) }), _jsx(Route, { path: "/clientes/financeiro", element: _jsx(PermissionElement, { permission: "finance.view", children: _jsx(CustomerFinancialPage, {}) }) }), _jsx(Route, { path: "/estoque", element: _jsx(PermissionElement, { permission: "reports.view", children: _jsx(InventoryPage, {}) }) }), _jsx(Route, { path: "/embaixadores", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(AmbassadorsPage, {}) }) }), _jsx(Route, { path: "/clientes/:id", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(CustomerDetailPage, {}) }) }), _jsx(Route, { path: "/automacoes", element: _jsx(PermissionElement, { permission: "automations.view", children: _jsx(AutomationsPage, {}) }) }), _jsx(Route, { path: "/segmentos", element: _jsx(PermissionElement, { permission: "reports.view", children: _jsx(SegmentsPage, {}) }) }), _jsx(Route, { path: "/agenda", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(AgendaPage, {}) }) }), _jsx(Route, { path: "/clientes-novos", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(NewCustomersPage, {}) }) }), _jsx(Route, { path: "/reativacao", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(ReactivationPage, {}) }) }), _jsx(Route, { path: "/ideias-votacao", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(IdeaBoardPage, {}) }) }), _jsx(Route, { path: "/mensagens", element: _jsx(PermissionElement, { permission: "messages.view", children: _jsx(MessagesPage, {}) }) }), _jsx(Route, { path: "/atividade-whatsapp", element: _jsx(PermissionElement, { permission: "reports.view", children: _jsx(WhatsappActivityPage, {}) }) }), _jsx(Route, { path: "/movimentacao", element: _jsx(PermissionElement, { permission: "reports.view", children: _jsx(MovementsPage, {}) }) }), _jsx(Route, { path: "/disparador", element: _jsx(PermissionElement, { permission: "messages.manage", children: _jsx(DisparadorPage, {}) }) }), _jsx(Route, { path: "/rotulos", element: _jsx(PermissionElement, { permission: "commercial.manage", children: _jsx(LabelsPage, {}) }) }), _jsx(Route, { path: "/prospeccao", element: _jsx(PermissionElement, { permission: "commercial.view", children: _jsx(ProspectingPage, {}) }) }), _jsx(Route, { path: "/metas", element: _jsx(PermissionElement, { permission: "finance.manage", children: _jsx(MetasPage, {}) }) }), _jsx(Route, { path: "/eventos", element: _jsx(PermissionElement, { permission: "messages.view", children: _jsx(EventsPage, {}) }) }), _jsx(Route, { path: "/usuarios", element: _jsx(PermissionElement, { permission: "admin.users.manage", children: _jsx(AdminUsersPage, {}) }) }), _jsx(Route, { path: "/config/whatsapp", element: _jsx(PermissionElement, { permission: "integrations.manage", children: _jsx(WhatsappConfigPage, {}) }) }), _jsx(Route, { path: "/novidades", element: _jsx(NovidadesPage, {}) }), _jsx(Route, { path: "/estrategias", element: _jsx(PermissionElement, { permission: "reports.view", children: _jsx(StrategiesPage, {}) }) })] }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/login", replace: true }) })] }) }));
}
