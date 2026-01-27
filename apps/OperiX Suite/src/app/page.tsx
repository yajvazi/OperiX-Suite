export default function ComingSoon() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 overflow-hidden relative">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-2xl w-full text-center relative z-10">
        <div className="inline-flex items-center gap-3 mb-12">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center glow">
            <span className="text-white font-bold text-2xl">O</span>
          </div>
          <span className="text-3xl font-bold text-white tracking-tight">OperiX Suite</span>
        </div>

        <h1 className="text-6xl md:text-8xl font-black text-white mb-8 tracking-tighter">
          COMING<br />
          <span className="bg-gradient-to-r from-blue-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
            SOON
          </span>
        </h1>

        <div className="h-1 w-24 bg-blue-500 mx-auto mb-10 rounded-full" />

        <p className="text-xl text-slate-400 mb-12 leading-relaxed">
          The ultimate multi-app business ecosystem is being built.<br />
          Invoicing, HR, Scanning, and Tracking — unified in one place.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="w-full sm:max-w-sm flex items-center gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl focus-within:border-blue-500/50 transition-all">
            <input
              type="email"
              placeholder="Enter your email for early access"
              className="flex-1 bg-transparent px-4 py-2 text-white outline-none placeholder:text-slate-600"
            />
            <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-semibold transition-all">
              Notify Me
            </button>
          </div>
        </div>

        <div className="mt-20 flex items-center justify-center gap-8">
          <div className="text-center px-6 border-r border-slate-800">
            <div className="text-2xl font-bold text-white">4</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">Apps</div>
          </div>
          <div className="text-center px-6 border-r border-slate-800">
            <div className="text-2xl font-bold text-white">1</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">Platform</div>
          </div>
          <div className="text-center px-6">
            <div className="text-2xl font-bold text-white">2026</div>
            <div className="text-xs text-slate-500 uppercase tracking-widest mt-1">Launch</div>
          </div>
        </div>
      </div>

      {/* Footer link to the slug for you */}
      <div className="absolute bottom-8 text-slate-700 text-sm">
        <p>Stay tuned for OperiX Suite.</p>
      </div>
    </div>
  );
}





