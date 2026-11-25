# Air Monitor — Telegram Mini App

Прототип гражданской карты статусов воздушных тревог. CSS основан на исходном Liquid Glass виджете. По умолчанию DEMO, все состояния вымышлены. Маркеры — административные центры, не координаты целей. Карта требует доступа к Leaflet CDN и OSM.

## GitHub Pages
1. Создайте репозиторий `air-monitor` и загрузите содержимое этой папки в корень ветки main.
2. Settings → Pages → Deploy from a branch → main / (root).
3. Откройте опубликованный HTTPS URL; в BotFather настройте Menu Button или Main Mini App на этот URL.

## aiogram 3
```python
from aiogram.types import MenuButtonWebApp, WebAppInfo
await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(
    text='Карта тривог', web_app=WebAppInfo(url='https://USERNAME.github.io/air-monitor/')))
```

## API
В app.js установите API_URL в HTTPS URL вашего публичного read-only API. Сервер должен возвращать только официальные статусы тревог по областям, разрешить CORS для origin GitHub Pages, и обновлять updated_at_ms при подтвержденном обновлении источника. Никаких токенов в JS. Схема: `{"updated_at_ms": 1790000000000, "regions": {"Запорізька": {"status":"active", "started_at_ms":1789999900000}, "Київська":{"status":"ended","started_at_ms":1789999000000,"ended_at_ms":1789999500000}}}`. Ключи регионов соответствуют regions в app.js. Неизвестный статус — unknown, пропущенные области считаются неизвестными. Все даты — Unix milliseconds. При ошибке API или устаревании более 120 секунд приложение показывает неизвестные статусы. Запрос каждые 15 секунд. API и подключение к источникам не входят в прототип. Лента — последние текущие состояния регионов, не полный журнал.

Для локальной проверки: `python -m http.server 8000`, открыть http://localhost:8000. Для production оцените правила использования OSM tiles: https://operations.osmfoundation.org/policies/tiles/ .
