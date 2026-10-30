//frontend/src/layouts/MainLayout.jsx
import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import "./layouts.css";

export default function MainLayout() {
  return (
    <div className="main-layout">
      <Navbar />

      <main className="main-layout-content">
        <Outlet />
      </main>

      <footer className="main-footer">
        <div className="main-footer-container">
          <p>
            © {new Date().getFullYear()} FindBack AI. All rights reserved.
          </p>

          <p>
            Helping lost belongings find their way home.
          </p>
        </div>
      </footer>
    </div>
  );
}