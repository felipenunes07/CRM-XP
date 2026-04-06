import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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
    return (_jsx(Suspense, { fallback: _jsx("div", { className: "page-loading fullscreen", children: "Carregando tela..." }), children: _jsxs(Routes, { children: [_jsxs(Route, { element: _jsx(AppShell, {}), children: [_jsx(Route, { path: "/", element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "/clientes", element: _jsx(CustomersPage, {}) }), _jsx(Route, { path: "/clientes/:id", element: _jsx(CustomerDetailPage, {}) }), _jsx(Route, { path: "/segmentos", element: _jsx(SegmentsPage, {}) }), _jsx(Route, { path: "/agenda", element: _jsx(AgendaPage, {}) }), _jsx(Route, { path: "/mensagens", element: _jsx(MessagesPage, {}) }), _jsx(Route, { path: "/rotulos", element: _jsx(LabelsPage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }));
}
