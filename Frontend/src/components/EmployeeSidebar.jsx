import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  UserPlus,
  RotateCcw,
  Bike,
  BatteryCharging,
  LogOut,
  X,
} from "lucide-react";

// Standard Next.js/Vite image imports
import logo from "../assets/EV-final-logo.png";
import brandLogo from "../assets/brand.jpeg";

// Re-designed style constants for a more modern look
const navItem = "flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all duration-300 group relative overflow-hidden";
const active = "bg-slate-900 text-white font-semibold shadow-lg shadow-slate-200 translate-x-1";
const inactive = "text-slate-500 hover:bg-slate-50 hover:text-slate-900";

export default function EmployeeSidebar({
  isMobile = false,
  onClose,
  onLogout,
  collapsed = false,
  onCollapsedNavClick,
}) {
  const fullLogo = logo?.src || logo;
  const markLogo = brandLogo?.src || brandLogo;

  return (
    <aside 
      className={`
        ${isMobile ? "fixed inset-y-0 left-0 z-50 shadow-2xl" : "sticky top-0"} 
        flex flex-col bg-white border-r border-slate-100 transition-all duration-500 ease-in-out 
        h-screen overflow-hidden shrink-0
        ${collapsed ? "w-20" : "w-64"}
      `}
    >
      {/* 1. LOGO SECTION - Enhanced Brand Space */}
      <div className="flex items-center justify-between px-5 h-24 shrink-0 border-b border-slate-50 bg-gradient-to-b from-slate-50/50 to-white">
        <div className={`flex items-center transition-all duration-500 ${collapsed ? "w-full justify-center scale-110" : "w-40 hover:scale-105"}`}>
          <img
            src={collapsed ? markLogo : fullLogo}
            alt="eVEGAH"
            className={`${collapsed ? "h-11 w-11 rounded-xl shadow-sm border border-slate-100" : "h-10 w-auto"} object-contain block transition-all`}
            style={{ 
              minWidth: collapsed ? '44px' : '140px',
            }}
          />
        </div>

        {isMobile && (
          <button className="w-9 h-9 rounded-xl grid place-items-center hover:bg-slate-100 transition-colors" onClick={onClose}>
            <X size={20} className="text-slate-400" />
          </button>
        )}
      </div>

      {/* 2. NAVIGATION - Improved Interactive Elements */}
      <nav className="px-4 py-8 space-y-2 flex-1 overflow-y-auto no-scrollbar">
        {[
          ["/employee/dashboard", "Dashboard", LayoutGrid, "bg-blue-50 text-blue-600"],
          ["/employee/new-rider", "New Rider", UserPlus, "bg-emerald-50 text-emerald-600"],
          ["/employee/retain-rider", "Retain Rider", RotateCcw, "bg-violet-50 text-violet-600"],
          ["/employee/return-vehicle", "Return Vehicle", Bike, "bg-amber-50 text-amber-600"],
          ["/employee/battery-swap", "Battery Swap", BatteryCharging, "bg-cyan-50 text-cyan-600"],
        ].map(([to, label, Icon, iconStyle]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${navItem} ${collapsed ? "justify-center px-0" : ""} ${isActive ? active : inactive}`
            }
            onClick={() => {
              if (!isMobile && collapsed) onCollapsedNavClick?.();
              onClose?.();
            }}
          >
            {({ isActive }) => (
              <>
                {/* Active Indicator Line */}
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-white rounded-r-full" />
                )}
                
                <span className={`shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 ${
                  isActive ? "bg-white/10 text-white rotate-[10deg]" : `${iconStyle} group-hover:scale-110`
                }`}>
                  <Icon size={20} />
                </span>
                
                {!collapsed && (
                  <span className={`truncate font-medium tracking-tight ${isActive ? "text-white" : "text-slate-600"}`}>
                    {label}
                  </span>
                )}

                {/* Tooltip for Collapsed State */}
                {collapsed && (
                  <div className="absolute left-16 invisible group-hover:visible opacity-0 group-hover:opacity-100 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg whitespace-nowrap transition-all z-50">
                    {label}
                  </div>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 3. FOOTER - Clean Action Zone */}
      <div className="p-4 shrink-0 bg-slate-50/50 border-t border-slate-100">
        <button
          className={`group flex items-center gap-3 w-full rounded-2xl bg-white border border-slate-200 px-3 py-3 text-red-500 text-sm font-bold shadow-sm hover:bg-red-50 hover:border-red-100 hover:text-red-600 transition-all duration-300 ${
            collapsed ? "justify-center" : ""
          }`}
          onClick={onLogout}
        >
          <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
          {!collapsed && <span>Logout System</span>}
        </button>
      </div>

      {isMobile && (
        <button className="absolute -right-14 top-6 p-3 bg-slate-900 rounded-2xl shadow-xl text-white active:scale-95 transition-transform" onClick={onClose}>
          <X size={24} />
        </button>
      )}
    </aside>
  );
}