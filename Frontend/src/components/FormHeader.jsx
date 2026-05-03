import Logo from "../assets/evegah-logo-white.webp";

export default function FormHeader({ title }) {
  return (
    <div className="rounded-t-2xl border-b border-slate-200 bg-white p-6 px-8 shadow-sm">
      <div className="flex justify-between items-start">
        
        {/* Left Side */}
        <div>
          <img src={Logo} className="w-32 mb-1" />
          <p className="text-sm text-slate-500">Shared E-Mobility Solutions</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="h-2 w-2 rounded-full bg-violet-500" />
          </div>
        </div>

        {/* Right Side */}
        <div className="text-right text-sm leading-tight text-slate-500">
          <p className="font-semibold text-slate-700">EVEGAH MOBILITY PVT LTD</p>
          <p>CIN: U34300MP2022PTC059373</p>
          <p>www.evegah.com</p>
        </div>
      </div>

      <h2 className="mt-6 text-center text-xl font-semibold text-slate-900">
        {title}
      </h2>
    </div>
  );
}
