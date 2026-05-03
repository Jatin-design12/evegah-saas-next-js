import {
  Bell,
  Search,
  LogOut,
  Menu,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
// Using the consistent logo import from your assets
import logo from "../assets/EV-final-logo.png";

export default function EmployeeTopbar({
  onSidebarToggle,
  onToggleCollapse = () => {},
  showSidebarButton = true,
  collapsed = false,
  isSidebarOpen = false,
  onLogout = () => {},
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur-md">
      <div className="px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        
        {/* LEFT: Branding & Toggle */}
        <div className="flex items-center gap-4">
          {/* Logo only shows on mobile Topbar, as it's in the Sidebar for Desktop */}
          <div className="flex items-center gap-3 lg:hidden">
            <img src={logo?.src || logo} className="h-8 w-auto" alt="eVEGAH" />
          </div>

          {showSidebarButton && (
            <button
              type="button"
              className="hidden lg:flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 hover:bg-purple-50 hover:text-purple-600 transition-all duration-300 border border-transparent hover:border-purple-100"
              onClick={onToggleCollapse}
            >
              {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          )}

          <div className="hidden lg:flex flex-col">
            <h1 className="text-sm font-bold text-slate-800 leading-none">Employee Console</h1>
            <span className="text-[10px] font-medium text-purple-500 uppercase tracking-wider mt-1">Fleet Management</span>
          </div>
        </div>

        {/* CENTER: Search Bar */}
        <div className="flex-1 max-w-md hidden md:block">
          <div className="relative group">
            <Search 
              size={16} 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-purple-500 transition-colors" 
            />
            <input
              type="text"
              placeholder="Search rider, vehicle or battery..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none focus:border-purple-300 focus:bg-white focus:ring-4 focus:ring-purple-50 transition-all"
            />
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Menu Toggle */}
          {showSidebarButton && (
            <button
              type="button"
              className={`lg:hidden h-10 w-10 rounded-xl border border-slate-200 bg-white grid place-items-center text-slate-700 transition-all ${
                isSidebarOpen ? "bg-purple-50 border-purple-200 text-purple-600" : ""
              }`}
              onClick={onSidebarToggle}
            >
              <Menu size={20} className={isSidebarOpen ? "rotate-90" : ""} />
            </button>
          )}

          <button
            type="button"
            className="relative h-10 w-10 flex items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-500 hover:bg-slate-50 transition-all"
          >
            <Bell size={18} />
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-500 border-2 border-white"></span>
          </button>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-100">
            <ShieldCheck size={16} className="text-purple-600" />
            <span className="text-xs font-bold text-purple-700">Verified</span>
          </div>

          <div className="h-8 w-px bg-slate-100 mx-1 hidden sm:block"></div>

          <button
            type="button"
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-200 hover:bg-slate-800 active:scale-95 transition-all"
            onClick={onLogout}
          >
            <LogOut size={16} />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}