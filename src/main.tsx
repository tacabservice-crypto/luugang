import { StrictMode, Suspense, lazy } from 'react';
import './api-runtime';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import ErrorPage from "./pages/ErrorPage";

const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const BecomeVip = lazy(() => import('./pages/BecomeVip'));
const Tournaments = lazy(() => import('./pages/Tournaments'));

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/room/:roomId",
    element: <App />,
  },
  {
    path: "/admin",
    element: <AdminDashboard />,
  },
  {
    path: "/vip",
    element: <BecomeVip />,
  },
  {
    path: "/tournaments",
    element: <Tournaments />,
  },
  {
    path: "/*",
    element: <Navigate to="/" replace />,
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#020012] text-sm font-bold text-white">Loading LudoSom…</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </LanguageProvider>
  </StrictMode>,
);
