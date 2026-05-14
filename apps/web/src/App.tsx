import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
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
const LabelsPage = lazy(async () => ({ default: (await import("./pages/LabelsPage")).LabelsPage }));
const ProspectingPage = lazy(async () => ({ default: (await import("./pages/ProspectingPage")).ProspectingPage }));
const DisparadorPage = lazy(async () => ({ default: (await import("./pages/DisparadorPage")).DisparadorPage }));
const MetasPage = lazy(async () => ({ default: (await import("./pages/MetasPage")).MetasPage }));
const PipelinePage = lazy(async () => ({ default: (await import("./pages/PipelinePage")).PipelinePage }));
const WhatsappConfigPage = lazy(async () => ({ default: (await import("./pages/WhatsappConfigPage")).WhatsappConfigPage }));
const LoginPage = lazy(async () => ({ default: (await import("./pages/LoginPage")).LoginPage }));

function RouteLoadingFallback() {
  const { tx } = useUiLanguage();

  return <div className="page-loading fullscreen">{tx("Carregando tela...", "正在加载页面...")}</div>;
}

function ProtectedShell() {
  const { token, user, loading } = useAuth();

  if (loading) {
    return <RouteLoadingFallback />;
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}

function PublicLoginRoute() {
  const { token, user, loading } = useAuth();

  if (loading) {
    return <RouteLoadingFallback />;
  }

  if (token && user) {
    return <Navigate to="/" replace />;
  }

  return <LoginPage />;
}

export default function App() {
  const { tx } = useUiLanguage();

  return (
    <Suspense fallback={<div className="page-loading fullscreen">{tx("Carregando tela...", "正在加载页面...")}</div>}>
      <Routes>
        <Route path="/login" element={<PublicLoginRoute />} />
        <Route element={<ProtectedShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/atendentes" element={<AttendantsPage />} />
          <Route path="/clientes" element={<CustomersPage />} />
{/* <Route path="/clientes/financeiro" element={<CustomerFinancialPage />} /> */}
          <Route path="/estoque" element={<InventoryPage />} />
          <Route path="/embaixadores" element={<AmbassadorsPage />} />
          <Route path="/clientes/:id" element={<CustomerDetailPage />} />
          <Route path="/automacoes" element={<AutomationsPage />} />
          <Route path="/segmentos" element={<SegmentsPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/clientes-novos" element={<NewCustomersPage />} />
          <Route path="/reativacao" element={<ReactivationPage />} />
          <Route path="/ideias-votacao" element={<IdeaBoardPage />} />
          <Route path="/mensagens" element={<MessagesPage />} />
          <Route path="/atividade-whatsapp" element={<WhatsappActivityPage />} />
          <Route path="/disparador" element={<DisparadorPage />} />
          <Route path="/rotulos" element={<LabelsPage />} />
          <Route path="/prospeccao" element={<ProspectingPage />} />
          <Route path="/metas" element={<MetasPage />} />
          <Route path="/usuarios" element={<WhatsappConfigPage />} />
          <Route path="/config/whatsapp" element={<WhatsappConfigPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}
