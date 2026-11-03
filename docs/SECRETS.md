# Секреты и переменные окружения

Правила для этого репозитория (и для агентов Claude/Codex, которые с ним работают):

- Реальные значения — только в `.env` (он в `.gitignore`), в секретах GitHub Actions или в Environment Variables Vercel. В git их не коммитим.
- `.env.example` — шаблон: имена переменных и плейсхолдеры, без реальных ключей.
- Агенты получают копию репозитория без `.env` и без прод-ключей.

## Проверка перед коммитом

В репо лежит хук `.githooks/pre-commit`. Он не включается сам. Включить в своём клоне:

```sh
git config core.hooksPath .githooks
```

Хук не даёт закоммитить `.env*` (кроме `.env.example`), `*.pem`, `*.key` и, если установлен [gitleaks](https://github.com/gitleaks/gitleaks), сканирует staged-изменения с конфигом `.gitleaks.toml`. Без gitleaks хук только предупреждает.

Ручная проверка всего репо (значения скрыты):

```sh
gitleaks dir --redact --config .gitleaks.toml .
```
