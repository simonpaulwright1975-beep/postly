import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./pages/Layout";
import { Spinner } from "./components/ui";

// The rate-card and shipment pages pull in the Excel parser (SheetJS), so they
// are code-split and load after the page shell has painted.
const RateCards = lazy(() => import("./pages/RateCards"));
const Shipments = lazy(() => import("./pages/Shipments"));
const Compare = lazy(() => import("./pages/Compare"));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<Spinner />}>
              <RateCards />
            </Suspense>
          }
        />
        <Route
          path="shipments"
          element={
            <Suspense fallback={<Spinner />}>
              <Shipments />
            </Suspense>
          }
        />
        <Route
          path="compare"
          element={
            <Suspense fallback={<Spinner />}>
              <Compare />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
