import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";

const AppShell = lazy(async () => ({ default: (await import("./components/AppShell")).AppShell }));
const DashboardPage = lazy(async () => ({ default: (await import("./pages/DashboardPage")).DashboardPage }));
const CustomersPage = lazy(async () => ({ default: (await import("./pages/CustomersPage")).CustomersPage }));
const CustomerDetailPage = lazy(async () => ({
  default: (await import("./pages/CustomerDetailPage")).CustomerDetailPage,
}));
const SegmentsPage = lazy(async () => ({ default: (await import("./pages/SegmentsPage")).SegmentsPage }));
const AgendaPage = lazy(async () => ({ default: (await import("./pages/AgendaPage")).AgendaPage }));
const MessagesPage = lazy(async () => ({ default: (await import("./pages/MessagesPage")).MessagesPage }));
const LabelsPage = lazy(async () => ({ default: (await import("./pages/LabelsPage")).LabelsPage }));
const LoginPage = lazy(async () => ({ default: (await import("./pages/LoginPage")).LoginPage }));

export default function App() {
  const { token, loading } = useAuth();

  if (loading) {
    return <div className="page-loading fullscreen">Carregando sessão...</div>;
  }

  if (!token) {
    return (
      <Suspense fallback={<div className="page-loading fullscreen">Carregando sessão...</div>}>
        <LoginPage />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<div className="page-loading fullscreen">Carregando tela...</div>}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clientes" element={<CustomersPage />} />
          <Route path="/clientes/:id" element={<CustomerDetailPage />} />
          <Route path="/segmentos" element={<SegmentsPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/mensagens" element={<MessagesPage />} />
          <Route path="/rotulos" element={<LabelsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
