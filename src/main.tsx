import { StrictMode, Suspense, lazy } from 'react';
import './api-runtime';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import ErrorPage from "./pages/ErrorPage";
import GlobalPullToRefresh from './components/GlobalPullToRefresh';
import NativeUpdateGate from './components/NativeUpdateGate';

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
    errorElement: <ErrorPage />,
  },
  {
    path: "/admin",
    element: <AdminDashboard />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/cashier",
    element: <AdminDashboard cashierMode />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/vip",
    element: <BecomeVip />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/tournaments",
    element: <Tournaments />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/*",
    element: <Navigate to="/" replace />,
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <Suspense fallback={<div className="fixed inset-x-0 top-[62px] z-[200] flex justify-center"><div className="h-7 w-7 animate-spin rounded-full border-[3px] border-blue-500 border-t-transparent" /></div>}>
        <GlobalPullToRefresh>
          <RouterProvider router={router} />
          <NativeUpdateGate />
        </GlobalPullToRefresh>
      </Suspense>
    </LanguageProvider>
  </StrictMode>,
);
