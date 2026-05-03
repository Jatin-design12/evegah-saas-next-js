import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";

import EmployeeTopbar from "../EmployeeTopbar";
import EmployeeSidebar from "../EmployeeSidebar";
import { auth } from "../../config/firebase";
import { clearAuthSession } from "../../utils/authSession";

export default function EmployeeLayout({ children, showSidebar = true }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const collapsePulseTimerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const raw = localStorage.getItem("evegah.employee.sidebarCollapsed.v1");
      if (raw === "1") setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("evegah.employee.sidebarCollapsed.v1", collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  const handleLogout = useCallback(async () => {
    try {
      clearAuthSession();
      await signOut(auth);
    } catch {
      // ignore
    }
    setSidebarOpen(false);
    navigate("/", { replace: true });
  }, [navigate]);

  const openSidebar = () => {
    if (!showSidebar) return;
    setSidebarOpen(true);
  };

  const closeSidebar = () => setSidebarOpen(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const pulseCollapsedNav = useCallback(() => {
    if (!collapsed) return;
    if (collapsePulseTimerRef.current) {
      clearTimeout(collapsePulseTimerRef.current);
      collapsePulseTimerRef.current = null;
    }

    setCollapsed(false);
    collapsePulseTimerRef.current = setTimeout(() => {
      setCollapsed(true);
      collapsePulseTimerRef.current = null;
    }, 260);
  }, [collapsed]);

  useEffect(() => {
    if (sidebarOpen) {
      setSidebarVisible(true);
      return;
    }
    if (!sidebarVisible) return;
    const timeout = setTimeout(() => setSidebarVisible(false), 300);
    return () => clearTimeout(timeout);
  }, [sidebarOpen, sidebarVisible]);

  useEffect(() => {
    return () => {
      if (collapsePulseTimerRef.current) clearTimeout(collapsePulseTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen flex bg-[#f7f8fc]">
      {showSidebar ? (
        <aside className={`hidden lg:block shrink-0 ${collapsed ? "w-20" : "w-72"}`}>
          <EmployeeSidebar
            onLogout={handleLogout}
            collapsed={collapsed}
            onCollapsedNavClick={pulseCollapsedNav}
          />
        </aside>
      ) : null}

      <div className="flex-1 flex flex-col overflow-hidden">
        <EmployeeTopbar
          onSidebarToggle={openSidebar}
          onToggleCollapse={toggleCollapsed}
          showSidebarButton={showSidebar}
          collapsed={collapsed}
          isSidebarOpen={sidebarOpen}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1280px] space-y-6">{children}</div>
        </main>
      </div>

      {showSidebar && sidebarVisible ? (
        <div
          className={`fixed inset-0 z-50 flex lg:hidden ${
            sidebarOpen ? "" : "pointer-events-none"
          }`}
        >
          <button
            type="button"
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${
              sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-label="Close navigation"
            onClick={closeSidebar}
          />
          <div className="relative flex h-full w-full justify-end">
            <div
              className={`h-full w-72 transform transition-transform duration-300 ease-out ${
                sidebarOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <EmployeeSidebar
                isMobile
                onClose={closeSidebar}
                collapsed={false}
                onLogout={async () => {
                  closeSidebar();
                  await handleLogout();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}