// App Router segment loading fallback — navigatsiya paytida (yoki segment suspend
// bo'lganda) sahifa kontenti o'rnida ko'rinadigan yengil skeleton. Shell (Sidebar/Header)
// joyida qoladi; faqat ishchi hudud skeletonga almashadi. Foydalanuvchi boshqaruvini
// bloklamaydi (overlay emas). Tepadagi navigation-progress chizig'i NetworkStatusBar'da.

export default function Loading() {
  return (
    <div className="w-full p-1 animate-pulse" aria-hidden>
      <div className="h-7 w-48 rounded-md bg-slate-200/80 dark:bg-slate-700/50 mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200/70 dark:bg-slate-700/40" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-slate-200/60 dark:bg-slate-700/30" />
        ))}
      </div>
      <span className="sr-only">Yuklanmoqda…</span>
    </div>
  );
}
