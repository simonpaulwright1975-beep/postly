import { Navigate, Route, Routes } from "react-router-dom";
import AuthGate from "./components/AuthGate";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Generate from "./pages/Generate";
import Drafts from "./pages/Drafts";
import CalendarPage from "./pages/CalendarPage";
import Catalogue from "./pages/Catalogue";
import MediaLibrary from "./pages/MediaLibrary";
import BrandProfilePage from "./pages/BrandProfilePage";
import Channels from "./pages/Channels";

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="generate" element={<Generate />} />
          <Route path="drafts" element={<Drafts />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="catalogue" element={<Catalogue />} />
          <Route path="media" element={<MediaLibrary />} />
          <Route path="brand" element={<BrandProfilePage />} />
          <Route path="channels" element={<Channels />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
