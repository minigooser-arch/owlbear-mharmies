# GitHub Pages Deployment Design

## Цель

Опубликовать расширение «Летопись: Армии» в публичном репозитории `minigooser-arch/owlbear-mharmies` и раздавать production-сборку через GitHub Pages, чтобы Owlbear Rodeo мог загружать manifest по постоянному HTTPS URL.

## Репозиторий и ветка

Локальная папка становится Git-репозиторием с основной веткой `main`. Remote `origin` указывает на `https://github.com/minigooser-arch/owlbear-mharmies.git`. Репозиторий на GitHub сейчас пуст, поэтому история создаётся локально и отправляется обычным первым push без force.

В Git попадают исходники, тесты, документация, package lock и deployment workflow. `node_modules`, локальные инструменты, delivery ZIP и обычная локальная папка `dist` остаются исключёнными. GitHub Pages получает собственный build artifact из CI, поэтому хранить generated `dist` в `main` не требуется.

## Сборка под project Pages

Сайт будет доступен под подпутём `/owlbear-mharmies/`, а не в корне домена. Vite получает production base `/owlbear-mharmies/`, чтобы ссылки на hashed assets из `index.html` и `background.html` открывались с правильного адреса.

Поля Owlbear manifest используют абсолютные HTTPS URL:

- icon: `https://minigooser-arch.github.io/owlbear-mharmies/icon.svg`;
- popover: `https://minigooser-arch.github.io/owlbear-mharmies/index.html`;
- background: `https://minigooser-arch.github.io/owlbear-mharmies/background.html`.

Готовый manifest URL для установки:

`https://minigooser-arch.github.io/owlbear-mharmies/manifest.json`

Локальный dev server сохраняет возможность разработки: Vite обслуживает project base, а README содержит актуальный локальный URL manifest.

## GitHub Actions

Workflow `.github/workflows/deploy-pages.yml` запускается на push в `main` и вручную через `workflow_dispatch`. Он:

1. получает исходники;
2. устанавливает Node.js 24 и npm cache;
3. выполняет `npm ci`;
4. запускает `npm run check`;
5. загружает `dist` как Pages artifact;
6. публикует artifact через официальный `actions/deploy-pages`.

Workflow использует минимальные разрешения: `contents: read`, `pages: write`, `id-token: write`. Deployment защищён стандартным environment `github-pages` и не требует пользовательских секретов.

## Авторизация и публикация

На компьютере отсутствуют Git и GitHub CLI, а GitHub token не задан. Они устанавливаются через `winget`. Авторизация выполняется официальным browser flow `gh auth login --web`; пользователь подтверждает доступ в открывшемся окне GitHub. Пароли и токены не записываются в файлы проекта и не выводятся в журнал.

После авторизации выполняется push `main`, затем GitHub Pages настраивается на workflow deployment. Если Pages ещё не активирован, используется GitHub API через авторизованный CLI для выбора build type `workflow`.

## Проверка и обработка ошибок

До push локально выполняется `npm run check`. После push проверяются:

- успешное завершение GitHub Actions workflow;
- HTTP 200 для опубликованного `manifest.json`, `index.html`, `background.html` и `icon.svg`;
- отсутствие корневых `/assets/...` ссылок, которые обходят project path;
- соответствие manifest опубликованным HTTPS адресам.

Если авторизация не завершена, публикация останавливается без повторных push. Если CI падает, исправление выполняется отдельным коммитом после чтения конкретного лога. Успех Pages не считается подтверждённым до фактического HTTP-ответа опубликованных URL.

