# Результаты проверки

Дата проверки: 2026-07-14, Europe/Moscow.

| Проверка | Результат |
|---|---|
| Node.js | `v24.18.0` |
| `npm.cmd run typecheck` | `PASS`, 0 diagnostics |
| `npm.cmd run lint` | `PASS`, 0 errors, 0 warnings |
| `npm.cmd test` | `PASS`, 32 test files, 70 tests |
| `npm.cmd run build` | `PASS`, созданы `dist/manifest.json`, `dist/icon.svg`, `dist/index.html`, `dist/background.html` и hashed assets |
| `npm.cmd audit` | 2 moderate, 0 high, 0 critical; транзитивный `uuid@9` через Owlbear SDK, fix unavailable |

## Live-room diagnostics

| Probe | Статус |
|---|---|
| Source retrieval | `NOT_RUN` |
| Local item creation | `NOT_RUN` |
| Local item change | `NOT_RUN` |
| Source update and restore | `NOT_RUN` |
| Background counter | `NOT_RUN` |
| Local context menu | `NOT_RUN` |

Live-проверки намеренно не помечены `PASS`: они должны быть выполнены пользователем в реальной комнате Owlbear Rodeo.
