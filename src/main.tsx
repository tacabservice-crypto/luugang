import { StrictMode } from 'react';
import './api-runtime';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './context/LanguageContext.tsx';
import ErrorPage from "./pages/ErrorPage";
import GlobalPullToRefresh from './components/GlobalPullToRefresh';
import NativeUpdateGate from './components/NativeUpdateGate';
import NativeBackHandler from './components/NativeBackHandler';
import AdminDashboard from './pages/AdminDashboard';
import BecomeVip from './pages/BecomeVip';
import Tournaments from './pages/Tournaments';

const router = createBrowserRouter([
  {
    path: "/",
    element: <><NativeBackHandler /><App /></>,
    errorElement: <ErrorPage />,
  },
  {
    path: "/room/:roomId",
    element: <><NativeBackHandler /><App /></>,
    errorElement: <ErrorPage />,
  },
  {
    path: "/admin",
    element: <><NativeBackHandler /><AdminDashboard /></>,
    errorElement: <ErrorPage />,
  },
  {
    path: "/cashier",
    element: <><NativeBackHandler /><AdminDashboard cashierMode /></>,
    errorElement: <ErrorPage />,
  },
  {
    path: "/vip",
    element: <><NativeBackHandler /><BecomeVip /></>,
    errorElement: <ErrorPage />,
  },
  {
    path: "/tournaments",
    element: <><NativeBackHandler /><Tournaments /></>,
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
      <GlobalPullToRefresh>
        <RouterProvider router={router} />
        <NativeUpdateGate />
      </GlobalPullToRefresh>
    </LanguageProvider>
  </StrictMode>,
);
