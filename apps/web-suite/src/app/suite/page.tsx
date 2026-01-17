import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">O</span>
            </div>
            <span className="text-xl font-bold text-white">OperiX Suite</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#products" className="text-slate-300 hover:text-white transition-colors">Products</a>
            <a href="#features" className="text-slate-300 hover:text-white transition-colors">Features</a>
            <a href="#pricing" className="text-slate-300 hover:text-white transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-slate-300 hover:text-white transition-colors">Sign In</button>
            <button className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-blue-500/20 rounded-full blur-[120px]" />

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2 mb-8">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span className="text-blue-400 text-sm font-medium">Now Available for iOS & Android</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight mb-6">
            Your Complete<br />
            <span className="bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              Business Suite
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Invoicing, HR Management, Document Scanning, and Time Tracking — all in one powerful platform designed for modern businesses.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25">
              Start Free Trial
            </button>
            <button className="w-full sm:w-auto border border-slate-700 hover:border-slate-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors">
              Watch Demo
            </button>
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section id="products" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Four Powerful Apps, One Platform</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Everything you need to run your business efficiently, from invoicing to HR management.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Invoice App */}
            <div className="group bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-blue-500/50 transition-all hover:-translate-y-2 hover:shadow-xl hover:shadow-blue-500/10">
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mb-5">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">OperiX Invoice</h3>
              <p className="text-slate-400 text-sm mb-4">
                Create professional invoices, manage clients, track payments, and generate reports.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-indigo-500/10 text-indigo-400 text-xs px-2.5 py-1 rounded-full">Invoicing</span>
                <span className="bg-indigo-500/10 text-indigo-400 text-xs px-2.5 py-1 rounded-full">Clients</span>
                <span className="bg-indigo-500/10 text-indigo-400 text-xs px-2.5 py-1 rounded-full">Reports</span>
              </div>
            </div>

            {/* HR App */}
            <div className="group bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-purple-500/50 transition-all hover:-translate-y-2 hover:shadow-xl hover:shadow-purple-500/10">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-5">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">OperiX HR</h3>
              <p className="text-slate-400 text-sm mb-4">
                Manage employees, payroll, attendance, and leave requests all in one place.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-purple-500/10 text-purple-400 text-xs px-2.5 py-1 rounded-full">Employees</span>
                <span className="bg-purple-500/10 text-purple-400 text-xs px-2.5 py-1 rounded-full">Payroll</span>
                <span className="bg-purple-500/10 text-purple-400 text-xs px-2.5 py-1 rounded-full">Attendance</span>
              </div>
            </div>

            {/* Scanner App */}
            <div className="group bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-emerald-500/50 transition-all hover:-translate-y-2 hover:shadow-xl hover:shadow-emerald-500/10">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center mb-5">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">OperiX Scanner</h3>
              <p className="text-slate-400 text-sm mb-4">
                Scan invoices, receipts, and documents with AI-powered data extraction.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-1 rounded-full">AI Scanning</span>
                <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-1 rounded-full">OCR</span>
                <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-1 rounded-full">Coming Soon</span>
              </div>
            </div>

            {/* Tracker App */}
            <div className="group bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-amber-500/50 transition-all hover:-translate-y-2 hover:shadow-xl hover:shadow-amber-500/10">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center mb-5">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">OperiX Tracker</h3>
              <p className="text-slate-400 text-sm mb-4">
                Track time, location, and mileage for employees and field workers.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="bg-amber-500/10 text-amber-400 text-xs px-2.5 py-1 rounded-full">Time Tracking</span>
                <span className="bg-amber-500/10 text-amber-400 text-xs px-2.5 py-1 rounded-full">GPS</span>
                <span className="bg-amber-500/10 text-amber-400 text-xs px-2.5 py-1 rounded-full">Coming Soon</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Why Choose OperiX?</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Built for modern businesses with security, scalability, and user experience in mind.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Bank-Level Security</h3>
              <p className="text-slate-400">End-to-end encryption and secure data storage to protect your business information.</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Lightning Fast</h3>
              <p className="text-slate-400">Optimized performance across all devices for the smoothest experience possible.</p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Real-Time Sync</h3>
              <p className="text-slate-400">Changes sync instantly across all your devices and team members.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Streamline Your Business?</h2>
          <p className="text-slate-400 text-lg mb-8">
            Join thousands of businesses already using OperiX Suite to manage their operations.
          </p>
          <button className="bg-blue-500 hover:bg-blue-600 text-white px-10 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25">
            Start Your Free Trial
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">O</span>
            </div>
            <span className="text-lg font-bold text-white">OperiX Suite</span>
          </div>
          <p className="text-slate-500 text-sm">© 2026 OperiX Suite. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Privacy</a>
            <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Terms</a>
            <a href="#" className="text-slate-400 hover:text-white transition-colors text-sm">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}





