
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import MainLayout from "./layouts/MainLayout";
import DashboardLayout from "./layouts/DashboardLayout";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import BrowseItems from "./pages/BrowseItems";
import ReportItem from "./pages/ReportItem";
import ItemDetails from "./pages/ItemDetails";
import MyReports from "./pages/MyReports";
import Matches from "./pages/Matches";
import MatchDetails from "./pages/MatchDetails";
import Claims from "./pages/Claims";
import AdminDashboard from "./pages/AdminDashboard";
import AdminReview from "./pages/AdminReview";
import RecoveryTasks from "./pages/RecoveryTasks";
import LocalAdminAssignments from "./pages/LocalAdminAssignments";
import LocalAdminApplications from "./pages/LocalAdminApplications";
import ProtectedRoute from "./components/ProtectedRoute";
import SuperAdminRoute from "./components/SuperAdminRoute";

import "./styles/pages.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<SuperAdminLogin />} />
          <Route path="/register" element={<Register />} />
          <Route path="/browse" element={<BrowseItems />} />
          <Route path="/items/:id" element={<ItemDetails />} />
        </Route>

        {/* Application pages */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />

            <Route path="/report" element={<ReportItem />} />

            <Route path="/my-reports" element={<MyReports />} />

            {/* Potential matches */}
            <Route path="/matches" element={<Matches />} />

            {/* Individual match details */}
            <Route path="/matches/:matchId" element={<MatchDetails />} />

            <Route path="/claims" element={<Claims />} />
            <Route path="/recovery/tasks" element={<RecoveryTasks />} />

            <Route element={<SuperAdminRoute />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/review" element={<AdminReview />} />
              <Route path="/admin/local-admin-applications" element={<LocalAdminApplications />} />
              <Route path="/admin/local-admins" element={<LocalAdminAssignments />} />
            </Route>
          </Route>
        </Route>

        {/* Redirect unknown URLs */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
