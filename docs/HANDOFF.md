# Передача проекта: Пиксельный задачник

Всё, что нужно, чтобы продолжить разработку с другого аккаунта или в новой сессии. Краткая карта и правила — в `CLAUDE.md` в корне; здесь история решений и подробности. Ранние разделы местами устарели: где они расходятся с разделами ниже (Firebase, моды), верны нижние.

## Что это

Пиксельный таск-трекер — узкая полоска у правого края экрана на всю высоту. Оболочки: Tauri 2 (Windows), Capacitor (Android APK), PWA на GitHub Pages; интерфейс в `web/index.html` плюс хост модов `web/mods-host.js`. Репозиторий: `github.com/eMRK-xd/pixel-zadachnik`, последний релиз v0.3.9.

## Карта файлов

| Путь | Что внутри |
|---|---|
| `web/index.html` | Всё приложение: разметка, CSS, логика, звук (Web Audio), частицы, скины-глаза, отчёт, дедлайны, мост к Tauri (`window.dock`) |
| `src-tauri/src/main.rs` | Окно-полоска у края, трей, Ctrl+Alt+T, single-instance (`--quit`), буфер, запросы к Ollama, мост для MCP (`snapshot`, `take_inbox`), импорт legacy-данных |
| `src-tauri/tauri.conf.json` | identifier `com.pixel.zadachnik`, окно без рамки, `frontendDist: ../web` |
| `mcp/server.js` | MCP-сервер `zadachnik`: `list_tasks`, `add_tasks` (upsert по `external_id`/`id`), `update_task`, `complete_tasks`, `add_subtasks`, `delete_tasks`, `sync_calendar` |
| `web/manifest.webmanifest`, `web/sw.js`, `web/icon-*.png` | Телефонная версия (PWA): тот же `index.html`, офлайн-кэш |
| `make-icon.js` | Рисует `icon.ico`/`icon.png`, `src-tauri/icons`, `web/icon-*.png` (глаз-«Солнце» на круглом тёмном диске с тонким золотым кольцом, без рамки, вокруг прозрачно; 32×32 пиксель-арт) |

## Как собрать

Нужны Node, Rust (rustup, stable-msvc), Visual Studio Build Tools с C++.

```bash
npm install
npm run build            # → src-tauri/target/release/zadachnik.exe
cd mcp && npm install    # MCP-сервер
```

Перед пересборкой закрой запущенное приложение: `zadachnik.exe --quit` (иначе exe занят и сборка падает). Быстрая проверка UI без сборки: отдать `web/index.html` любым локальным сервером и открыть в браузере (Tauri-функции там просто выключены).

## Данные и интеграции

- Состояние в `localStorage` ключ `pixel-tracker-v1` (WebView2 Tauri). Поля: `tasks[]` (`id, col, text, done, doneAt, src, url, due, added, when, upd`, а также `description`, `assignees[]`, `ext` (= external_id, напр. CRASH-402), `subtasks[]` `{id: "t12.3", text, done, due, assignees}`, `gcal` — уже отправлена в Google), `archive[]`, `daily[]`, `goals`, `xp`, `eye`, `unlocked[]`, `theme`, `mute`, `amb`, `crt`, `mono`, `trail`, `view` (доска/календарь), `cal` (iCal-ссылка и события), `gone` (надгробия для синка) и т.д.
- Мост MCP: приложение пишет снимок `%APPDATA%\com.pixel.zadachnik\tasks.json` (с подзадачами); сервер кладёт очередь в `inbox.json`, приложение забирает раз в 2,5 с (rename-claim). Элемент без `op` — задача (upsert по `id`/`external_id`, иначе дедуп по тексту/ссылке); с `op`: `update`, `complete`, `add_subtasks`, `delete`, `calendar`. Поиск: id → external_id → точный текст (сначала задачи, потом подзадачи).
- Вкладка «Календарь»: события Google по секретной iCal-ссылке (качает Rust-команда `fetch_text` раз в 15 мин; парсер ICS с RRULE/EXDATE прямо в `index.html`) или от Клода через `sync_calendar`, плюс все дедлайны задач и подзадач по дням. «→G» открывает готовое событие в Google, «→ задача» делает задачу из события.
- Синхронизация устройств: приватный GitHub Gist `zadachnik-sync.json` (токен с правом Gists хранится в `localStorage["pixel-local"]`, в экспорт не попадает). Слияние по задаче: побеждает более новый `upd`, удаления — надгробия `S.gone`. Цели/дейлик/опыт — целиком по `metaUpd`. С включённым синком id новых задач получают суффикс устройства (`t58-k3x`).
- Экспорт/импорт всех данных JSON через буфер — в настройках.
- Зрачок глаза расширяется, когда открытых задач мало (`dil()`: 20+ → как нарисован, ~10 → +0,5, ≤5 → +1 пиксель).
- Регистрация MCP в Claude Code: запись `mcpServers.zadachnik` в `~/.claude.json` (`command: node`, `args: [<путь>/mcp/server.js]`).
- Отчёт: шаблон → если запущена Ollama с `qwen2.5:7b`, переписывается моделью (через Rust, без CORS) и чистится `tidyReport`; без модели копируется промпт для Claude.
- Google Календарь: кнопка в поповере дедлайна открывает `calendar.google.com/calendar/render?action=TEMPLATE…` (без OAuth).

## Решения и вкусы владельца (важно сохранить)

- Стиль: настроение Loop Hero (тёмный/чёрный фон, золотые зубчатые рамки, палитра с его Steam-баннера: ночное небо, бирюза, оранжевая черепица, охра, мох), CRT-фильтр. Тема «фиолет» — запасная. Неоновая тема включается скином «Самурай».
- Звук: синтез в коде, ми минор, «меланхолично». Выполнение задачи — пульс-волна, остинато в духе композитора blinch, переборы вверх/вниз (нисходящие падают до конца), прогрессия i–VI–III–VII на комбо, своя тональность у колонки, стерео (есть моно), наслоение партий на 3/5/7-й задаче, фанфара (минор→мажор) на зачистку колонки. Звук выполнения идёт мимо low-pass (хотели «открытый верх»). В неоновой теме — синтвейв (свист клинка + аккорд, перемотка кассеты, синтвейв-эмбиент).
- Скины глаза: 7 базовых, 5 за уровни (Пар/Хром/Папка/Блендер/Панель — собственные пиксельные отсылки, не копии логотипов), секретные по кодам (`клод`, `deadcells`, `deadlock`, `pacman`, `katana zero`), сброс кодом `сброс` или кнопкой. Любимый — «Кот» (по умолчанию). «Самурая» владелец собирался дорисовать сам.
- Принцип: не встраивать чужие ассеты/спрайты/логотипы (репо публичный), рисовать свои отсылки. Личные данные в коде не хранить — в репо только демо-задачи.
- Общение по-русски, коротко; владелец часто правит дизайн итерациями по скринам.

## Бэклог / идеи

1. **Мобильная версия: черновик готов (PWA + синк через Gist).** Вариант с Google-аккаунтом вместо Gist: Вариант без своего сервера: PWA (тот же `web/index.html`, адаптив под телефон) + хранение состояния в Google Drive `appDataFolder` через OAuth (нужен Google Cloud project и OAuth client ID, создаёт владелец). Desktop читает/пишет тот же файл. Альтернатива: Tauri mobile (Android SDK) — тяжелее.
2. **Google Calendar API**: настоящая двусторонняя синхронизация дедлайнов (тоже нужен OAuth). Сейчас — ссылка-шаблон.
3. **YouGile**: коннектора нет; можно добавить в MCP-сервер инструмент на YouGile REST API (ключ пользователя хранить локально, не в репо).
4. Сортировка по дедлайну; напоминания о просроченных.
5. Перетащить задачу внутрь другой (сделать подзадачей): пока есть только обратное «⇱ вынести».
6. Хостинг PWA (GitHub Pages), чтобы поставить на телефон.

## Телефон: сайт и APK

- Сайт (PWA): `web/` публикуется на GitHub Pages workflow-ом `.github/workflows/pages.yml` → https://emrk-xd.github.io/pixel-zadachnik/
- APK: `mobile/` — обёртка Capacitor 7 (`CapacitorHttp` включён, поэтому iCal и GitHub API идут без CORS). Собирает `.github/workflows/android.yml` на каждый пуш в `web/` или `mobile/` и прикладывает `Zadachnik.apk` к последнему релизу. Подписывается постоянным ключом из секретов `ANDROID_KEYSTORE` (PKCS12, base64) и `ANDROID_KEYSTORE_PASS`, alias `zadachnik`, поэтому обновления ставятся поверх. Копия ключа у владельца: `%USERPROFILE%.zadachnik-android.p12` и `.zadachnik-android.pass` — не терять, иначе обновления снова потребуют переустановки.
- Синк: изменение отправляется через ~0,7 с, второе устройство проверяет гист раз в 5 с условным запросом (ETag, 304 не тратят лимит), только пока окно видно. События календаря тоже едут через синк (секретная iCal-ссылка — нет), поэтому браузер на телефоне, которому Google не отдаёт iCal, видит события с компа.
- На телефоне глаз следит за гироскопом (`deviceorientation`, база медленно подстраивается), а не за касаниями.

## Google Календарь: полная синхронизация (desktop)

- Владелец создаёт свой OAuth-клиент (Google Cloud → Calendar API → Google Auth Platform, External, **Publish app** чтобы refresh-токен не умирал через 7 дней → Clients → Desktop app) и вставляет Client ID/secret во вкладке «Календарь». Инструкция прямо там.
- Rust: `google_connect` (loopback 127.0.0.1:<порт> + PKCE, verifier/challenge делает страница), `google_api` (прокси только к `calendar/v3`, сам обновляет access-токен), `google_status`, `google_disconnect`. Токены — `%APPDATA%\com.pixel.zadachnik\google.json`, в синк/экспорт не попадают. Scope: `calendar.events`.
- JS `GCAL.run()` (раз в 2 мин и через 5 с после изменений): задача/подзадача с `due` = событие на весь день в primary с `extendedProperties.private {app:"zadachnik", zid}`; `x.gev` — id события, `x.gp` — что отправили последним. Локальная правка → PATCH; правка в Google (дата/название) при неизменной задаче → обратно в задачу; событие удалено в Google → у задачи снимается дедлайн; задача удалена/дедлайн снят → событие удаляется; сделанные → «✓ », серый (colorId 8). Остальные события primary на −7…+60 дней показываются во вкладке и едут на телефон через синк.
- Телефон с Google напрямую не говорит: всё приходит через синк с компа.

## Синхронизация через Firebase (основной способ с v0.3.4)

- Транспорт `FB` в `web/index.html`: Firestore, один документ `boards/<код>` с полем `doc` (тот же JSON, что был в гисте) и живой подпиской `onSnapshot` → `SYNC.run()`; SDK 11.0.2 грузится с gstatic динамически, только когда синк включён. Движок слияния тот же (`mergeDoc`, `coreOf`, `S.hlc`, `S.orderUpd`), гист остался запасным транспортом.
- «Ключ синхронизации» `ZDK1.<base64url>` = web-config Firebase + случайный код доски (32 символа). Первое устройство вставляет firebaseConfig и получает ключ (текст + QR через qrcodejs с cdnjs), второе вставляет ключ. Входа в Google нет (в WebView он запрещён).
- Правила Firestore (`FB_RULES` в коде, кнопка «копировать правила»): `get` и `write` только для документов с id ≥ 32 символов, `list` запрещён, размер `doc` < 900 КБ. Безопасность держится на секретности кода.
- В APK глобальная подмена fetch (`CapacitorHttp.enabled`) выключена — она ломала бы потоковые соединения Firestore; iCal на телефоне качается напрямую через `Capacitor.Plugins.CapacitorHttp.get`.
- `c.emu` в конфиге — крючок для локального эмулятора Firestore (для тестов).

## Моды (с v0.4.0)
- `web/mods-host.js` — хост: док снизу справа (`#dock`), каждый мод в iframe `sandbox="allow-scripts"` (origin null), общение только через postMessage, разрешения `media` / `tasks` / `links`. Подробно для авторов: `docs/MODS.md`.
- Встроенные моды: `web/mods/<id>/`, список `web/mods/index.json`. Первый — `vinyl` («Пластинка»).
- Свои моды на ПК: папка `mods` рядом с exe (запасной вариант — `%APPDATA%\com.pixel.zadachnik\mods`), выбирает `mods_root`, читает `list_mods`, открывает `open_mods_dir` через explorer.
- Док модов называется `#moddock`. НЕ `#dock`: элемент с id создаёт глобальную `window.dock` и затирает мост к оболочке (так однажды сломались глаз и календарь).
- Ключ синка, QR и код доски скрыты до «показать ключ» и снова прячутся при закрытии настроек.
- «Что играет»: Rust `media_state` / `media_art` / `media_control` через Windows media sessions (крейт `windows` 0.62, у async-типов метод `.join()`, не `.get()`).
- Вкл/выкл модов хранится в `LOCAL.mods` (своё на каждом устройстве), хранилище мода — `localStorage["pixel-mod:<id>"]`.
- Tauri подкладывает `__TAURI_INTERNALS__` и `ipc` и во фреймы. Вызовы оттуда отклоняются (Origin null, а WebView2 не принимает postMessage из дочерних фреймов) — проверено пробным модом.
- `index.html?fakemedia` — выдуманный плеер для проверки в браузере.
- Пауза синка (`LOCAL.hold`: 0/2/5/10 с): после галочки пуш ждёт столько секунд, поэтому быстрое «отметил → снял» не уходит на другие устройства.

## Проверка на телефоне (adb)

Телефон владельца подключается по USB с включённой «Отладкой по USB»; `adb` лежит в `%LOCALAPPDATA%\Android\platform-tools`.
- **Собрать APK локально, без GitHub:** `bash mobile/build-apk.sh --install` (~2,5 мин): JDK 21 и Android SDK лежат в `%LOCALAPPDATA%Android`, сборка идёт в копии `E:zadachnik-build` (Android Gradle не принимает кириллицу в пути), подпись тем же ключом из `%USERPROFILE%`, так что ставится поверх релиза с сохранением данных. Подготовка проекта общая с GitHub — `mobile/prepare-android.sh`.
- APK из GitHub: `gh run download <id> -n Zadachnik-apk`, затем `adb install -r Zadachnik.apk`.
- Локальная версия без пересборки: `adb reverse tcp:8767 tcp:8767`, открыть `http://localhost:8767/index.html` в Chrome на телефоне; DevTools — `adb forward tcp:9222 localabstract:chrome_devtools_remote`.
- Само приложение: на время замеров включить `"webContentsDebuggingEnabled": true` в `android` в `mobile/capacitor.config.json` (в релизах выключено); сокет `webview_devtools_remote_<pid>` (ищется в `/proc/net/unix`), `adb forward tcp:9223 localabstract:…`. Выключить, когда больше не нужно.
- Кадры: `requestAnimationFrame`-замер через `Runtime.evaluate` по DevTools-протоколу; снаружи — `adb shell dumpsys gfxinfo com.pixel.zadachnik`.
- Не выводить тексты задач владельца из телефона и не сохранять в его доску тестовые изменения.

## Мастер-вкладки и колонки

- `S.boards = [{id, name, icon, color, cols:[{id, name, color, lh, icon}]}]` — в `META_KEYS`, синкается вместе с целями и дейликом (последний изменивший побеждает).
- Задача хранит только id колонки (`t.col`), поэтому перенос колонки в другую вкладку переносит и её задачи. Задача с неизвестной колонкой (колонку удалили на другом устройстве) показывается в Инбоксе (`colOf()`).
- Инбокс (`INBOX`, id `inbox`) общий для всех вкладок; его имя — `S.colNames.inbox`.
- «Сегодня» — встроенная вкладка, не хранится в `S.boards`: задачи из всех вкладок с дедлайном на сегодня или просроченные (и подзадачи с таким дедлайном). Задача, добавленная там, получает дедлайн на сегодня.
- Миграция со старых 6 колонок: они становятся вкладкой «Основное» с теми же id; копия состояния до миграции лежит в `localStorage["pixel-tracker-v1-before-boards"]`.
- MCP: колонки берутся из снимка (`columns: [{id, name, board}]`), жёсткого списка в `mcp/server.js` больше нет.

## Где лежат данные ПК-версии

- `localStorage` WebView2: `%LOCALAPPDATA%com.pixel.zadachnikEBWebView` (по идентификатору приложения).
- Зеркало всего состояния `{S, LOCAL}`: `%USERPROFILE%.zadachnikstate.json` (+ `state.prev.json`), пишется после `save()`/`saveLocal()` с задержкой ~1 с (`stateMirror()`). При запуске, если `localStorage` пуст или в нём нет синка, а в файле есть, — восстановление из файла (старое содержимое — в `pixel-tracker-v1-before-restore`).
- Почему вне `AppData`: процессы, запущенные из упакованного приложения (Claude desktop — MSIX), получают свою копию `AppData`. Поэтому из инструментов Claude exe запускается через `explorer.exe`.
