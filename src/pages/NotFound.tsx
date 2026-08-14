// Нарочно не ссылается ни на одну внутреннюю страницу CRM (в т.ч. на "/") —
// это единственная страница, на которую попадает любой нераспознанный путь,
// и она не должна давать способ провалиться в основной сайт по клику.
export function NotFound() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-bg px-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-lg font-extrabold tracking-wide text-ink">
          <span className="font-black text-primary">RED</span>EVELOPMENT
        </span>
        <p className="text-sm text-ink-muted">Страница не найдена.</p>
      </div>
    </div>
  );
}
