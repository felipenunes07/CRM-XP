import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./hooks/useAuth";
import { UiLanguageProvider } from "./i18n";
import { isApiAuthError } from "./lib/api";
import "./styles.css";

const shouldRetryRequest = (failureCount: number, error: unknown) => {
  if (isApiAuthError(error)) {
    return false;
  }
  return failureCount < 2;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryRequest,
    },
    mutations: {
      retry: shouldRetryRequest,
    },
  },
});

// Handle chunk load errors (caused by new deployments)
window.addEventListener("error", (e) => {
  const isChunkError = 
    e.message?.includes("Failed to load module script") || 
    e.message?.includes("dynamically imported module") ||
    e.target instanceof HTMLScriptElement;
    
  if (isChunkError) {
    console.warn("Chunk load error detected, reloading page...", e);
    window.location.reload();
  }
}, true);

window.addEventListener("unhandledrejection", (e) => {
  const message = e.reason?.message || "";
  const stack = e.reason?.stack || "";
  
  if (message.includes("Failed to fetch dynamically imported module") || stack.includes("Loading chunk")) {
    console.warn("Dynamic import failure detected, reloading page...", e);
    window.location.reload();
  }
});


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <UiLanguageProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </UiLanguageProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
