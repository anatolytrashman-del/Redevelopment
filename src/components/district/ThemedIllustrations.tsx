// Тематические иллюстрации для карточек гида района (DistrictGuidePage.tsx) —
// владелец: "плодить иконки не хочется, может добавим справа какие-то
// тематические иллюстрации?". Пробный заход — один блок ("Целевая
// аудитория"), остальные добавляются по этому же принципу только если
// подход одобрен: моноширинная линия (stroke, без заливки) в тон текста
// (currentColor = text-ink), один цветной акцент на сцену (тот же принцип
// "boldness in one place", что и в остальной цветовой системе проекта) —
// не отдельный набор картинок с их собственной палитрой.
export function AudienceIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 170"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="10" y1="152" x2="140" y2="152" className="text-border-strong" strokeWidth={3} />
      <circle cx="66" cy="30" r="14" />
      <rect x="46" y="46" width="40" height="66" rx="20" />
      <circle cx="20" cy="100" r="9" />
      <rect x="6" y="111" width="28" height="41" rx="14" />
      <path d="M46,76 Q30,95 30,114" />
      <path d="M104,80 C104,70 118,70 118,80" strokeWidth={3.5} />
      <rect x="98" y="80" width="26" height="24" rx="4" className="text-primary" />
    </svg>
  );
}
