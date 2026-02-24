"use client";

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-shrink-0">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search customers, jobs, invoices..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#e85d04]/30 focus:border-[#e85d04] transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Status indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          <span>4 techs active</span>
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <span className="text-lg">🔔</span>
          <span className="absolute top-1 right-1 w-4 h-4 bg-[#e85d04] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            7
          </span>
        </button>

        {/* Help */}
        <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <span className="text-lg">❓</span>
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200"></div>

        {/* Date */}
        <div className="text-xs text-gray-500">
          <div className="font-medium text-gray-700">Mon, Feb 24</div>
          <div>8:42 AM</div>
        </div>
      </div>
    </header>
  );
}
