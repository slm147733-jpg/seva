import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import PageView from "@/pages/PageView";
import Login from "@/pages/Login";
import AdminSetup from "@/pages/AdminSetup";
import AdminRegister from "@/pages/AdminRegister";
import AdminDashboard from "@/pages/AdminDashboard";
import UserPortal from "@/pages/UserPortal";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/p/:slug" element={<PageView />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/setup" element={<AdminSetup />} />
      <Route path="/admin/register" element={<AdminRegister />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/portal" element={<UserPortal />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
