import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";

const AppShell = lazy(async () => ({ default: (await import("./components/AppShell")).AppShell }));
const DashboardPage = lazy(async () => ({ default: (await import("./pages/DashboardPage")).DashboardPage }));
const AttendantsPage = lazy(async () => ({ default: (await import("./pages/AttendantsPage")).AttendantsPage }));
const CustomersPage = lazy(async () => ({ default: (await import("./pages/CustomersPage")).CustomersPage }));
const AmbassadorsPage = lazy(async () => ({ default: (await import("./pages/AmbassadorsPage")).AmbassadorsPage }));
const InventoryPage = lazy(async () => ({ default: (await import("./pages/InventoryPage")).InventoryPage }));
const CustomerDetailPage = lazy(async () => ({
  default: (await import("./pages/CustomerDetailPage")).CustomerDetailPage,
}));
const SegmentsPage = lazy(async () => ({ default: (await import("./pages/SegmentsPage")).SegmentsPage }));
const AgendaPage = lazy(async () => ({ default: (await import("./pages/AgendaPage")).AgendaPage }));
const NewCustomersPage = lazy(async () => ({ default: (await import("./pages/NewCustomersPage")).NewCustomersPage }));
const ReactivationPage = lazy(async () => ({ default: (await import("./pages/ReactivationPage")).ReactivationPage }));
const IdeaBoardPage = lazy(async () => ({ default: (await import("./pages/IdeaBoardPage")).IdeaBoardPage }));
const MessagesPage = lazy(async () => ({ default: (await import("./pages/MessagesPage")).MessagesPage }));
const LabelsPage = lazy(async () => ({ default: (await import("./pages/LabelsPage")).LabelsPage }));
const ProspectingPage = lazy(async () => ({ default: (await import("./pages/ProspectingPage")).ProspectingPage }));
const DisparadorPage = lazy(async () => ({ default: (await import("./pages/DisparadorPage")).DisparadorPage }));
const MetasPage = lazy(async () => ({ default: (await import("./pages/MetasPage")).MetasPage }));
const LoginPage = lazy(async () => ({ default: (await import("./pages/LoginPage")).LoginPage }));

export default function App() {
  return (
    <Suspense fallback={<div className="page-loading fullscreen">Carregando tela...</div>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/atendentes" element={<AttendantsPage />} />
          <Route path="/clientes" element={<CustomersPage />} />
          <Route path="/estoque" element={<InventoryPage />} />
          <Route path="/embaixadores" element={<AmbassadorsPage />} />
          <Route path="/clientes/:id" element={<CustomerDetailPage />} />
          <Route path="/segmentos" element={<SegmentsPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/clientes-novos" element={<NewCustomersPage />} />
          <Route path="/reativacao" element={<ReactivationPage />} />
          <Route path="/ideias-votacao" element={<IdeaBoardPage />} />
          <Route path="/mensagens" element={<MessagesPage />} />
          <Route path="/disparador" element={<DisparadorPage />} />
          <Route path="/rotulos" element={<LabelsPage />} />
          <Route path="/prospeccao" element={<ProspectingPage />} />
          <Route path="/metas" element={<MetasPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
