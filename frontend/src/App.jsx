import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import MainLayout from "./layouts/MainLayout";
import DashboardLayout from "./layouts/DashboardLayout";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import BrowseItems from "./pages/BrowseItems";
import ReportItem from "./pages/ReportItem";
import ItemDetails from "./pages/ItemDetails";
import MyReports from "./pages/MyReports";
import Matches from "./pages/Matches";
import Claims from "./pages/Claims";
import AdminDashboard from "./pages/AdminDashboard";

import "./App.css";
import "./styles/pages.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Application pages */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/browse" element={<BrowseItems />} />
          <Route path="/report" element={<ReportItem />} />
          <Route path="/items/:id" element={<ItemDetails />} />
          <Route path="/my-reports" element={<MyReports />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/claims" element={<Claims />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>

        {/* Redirect unknown URLs */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;