import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getIdTokenResult, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebase";
import Logo from "../assets/logo.png";
import BGImage from "../assets/image_71158d.jpg";
import {
  getValidAuthSession,
  setAuthSession,
  SESSION_DURATION_MS,
} from "../utils/authSession";

const ADMIN_EMAIL = "adminev@gmail.com";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const existing = getValidAuthSession();
    if (existing) {
      navigate("/redirect", { replace: true });
    }
  }, [navigate]);

  const loginUser = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = credential.user;
      const tokenResult = await getIdTokenResult(firebaseUser);

      const normalizedEmail = String(firebaseUser.email || "").toLowerCase();
      const role =
        normalizedEmail === ADMIN_EMAIL
          ? "admin"
          : tokenResult.claims.role || "employee";

      setAuthSession({
        token: tokenResult.token,
        role,
        expiresAt: Date.now() + SESSION_DURATION_MS,
      });

      navigate("/redirect", { replace: true });
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  // Fixed image source handling for modern bundlers [cite: 17, 18, 22, 61]
  const backgroundSrc = BGImage?.src || BGImage;
  const logoSrc = Logo?.src || Logo;

  return (
    <div 
      className="min-h-screen w-full flex items-center justify-center p-6 bg-no-repeat bg-center bg-cover"
      style={{ backgroundImage: `url(${backgroundSrc})` }}
    >
      {/* Modern Minimalist Form Panel */}
      <div className="w-full max-w-[420px] bg-white border border-slate-200/60 p-10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.08)]">
        
        {/* Logo Section - Square Background Removed  */}
        <div className="flex flex-col items-center mb-10">
          <img 
            src={logoSrc} 
            alt="Evegah" 
            className="h-20 w-auto mb-0 object-contain"
            onError={(e) => { e.target.src = "https://via.placeholder.com/150?text=Evegah"; }} 
          />
          
          <p className="text-slate-500 text-sm ">Evegah Fleet Dashboard</p>
        </div>

        <form onSubmit={loginUser} className="space-y-5">
          {/* Email Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
            <input
              type="email"
              placeholder="Enter Your Email Id"
              className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
              <Link to="/reset" className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-tighter">Forgot Password?</Link>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              className="w-full px-5 py-3.5 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="py-2.5 bg-red-50 border border-red-100 rounded-lg">
              <p className="text-red-600 text-[11px] font-bold text-center uppercase">{error}</p>
            </div>
          )}

          {/* SaaS Button Styling [cite: 24, 34, 49] */}
          <button 
            disabled={loading}
            className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : "Login to Dashboard"}
          </button>
        </form>

        {/* Footer Navigation */}
        <div className="mt-10 flex items-center justify-center gap-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <Link to="/privacy" className="hover:text-indigo-600 transition-colors">Privacy Policy</Link>
          <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
          <Link to="/terms" className="hover:text-indigo-600 transition-colors">Terms & Conditions</Link>
        </div>
      </div>
    </div>
  );
}