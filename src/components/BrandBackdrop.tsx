// خلفية الشعار للشاشات الكبيرة (الدخول والإعداد) | the brand backdrop.
// Sky blue with soft lemon scoops drifting behind the card.
export default function BrandBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-sky grid place-items-center p-6">
      <svg className="absolute inset-0 w-full h-full opacity-[0.16] pointer-events-none" aria-hidden>
        <defs>
          <pattern id="sprinkles" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
            <rect x="10" y="14" width="22" height="6" rx="3" fill="#282828" />
            <rect x="70" y="40" width="22" height="6" rx="3" fill="#E9ED1D" />
            <rect x="30" y="78" width="22" height="6" rx="3" fill="#ffffff" />
            <rect x="88" y="96" width="22" height="6" rx="3" fill="#F9A72B" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sprinkles)" />
      </svg>
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-lemon/30 blur-3xl" aria-hidden />
      <div className="absolute -bottom-48 -right-32 w-[560px] h-[560px] rounded-full bg-white/25 blur-3xl" aria-hidden />
      <div className="relative w-full flex justify-center">{children}</div>
    </main>
  );
}
