# Дети лейтенанта Шмидта

Сайт ресторана и рабочая панель `/admin`. Публичные страницы и каталог остаются обычными HTML, CSS и JavaScript. Для входа, заявок и публикации изменений запустите приложение Flask с SQLite.

## Локальный запуск в PowerShell

Из корня репозитория, с Python 3.12:

```powershell
py -3.12 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r requirements-admin.txt
$env:RESTAURANT_SECRET_KEY = & .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
$env:RESTAURANT_DEV_HTTP = "1"
& .\.venv\Scripts\python.exe -m flask --app restaurant_admin init-db
& .\.venv\Scripts\python.exe -m flask --app restaurant_admin create-manager
& .\.venv\Scripts\python.exe -m flask --app restaurant_admin run
```

Откройте [панель](http://127.0.0.1:5000/admin) и войдите под созданным аккаунтом. Команда создания управляющего интерактивно запрашивает логин, имя и пароль. Локальная база по умолчанию находится в `instance/restaurant.sqlite3`. Команда `init-db` повторно запускается без перезаписи изменений. Новый ключ в новой сессии PowerShell потребует повторного входа.

## Настройка ресторана

1. В «Меню» проверьте импортированные цены. До публикации подтверждённой цены карточка на сайте показывает «Цена уточняется». Временно недоступное блюдо можно пометить прямо в списке меню. Фото можно указать HTTPS-ссылкой или путём к фото в `assets/`.
2. В «Настройках» опубликуйте рабочий телефон, часы и ссылку на политику обработки данных. Здесь включается приём заявок с сайта.
3. Создайте сотрудникам личные аккаунты. Заявка с сайта попадает в «Заявки». Сотрудник согласует визит с гостем и фиксирует бронь в действующем журнале ресторана, затем подтверждает её в панели.

Для VPS запускайте `waitress-serve --listen=127.0.0.1:8000 --max-request-body-size=32768 --trusted-proxy=127.0.0.1 --trusted-proxy-headers="x-forwarded-for x-forwarded-proto" --call restaurant_admin:create_app` под служебным пользователем за HTTPS-прокси. Передайте постоянный секрет `RESTAURANT_SECRET_KEY`, абсолютный путь к базе на постоянном диске в `RESTAURANT_DATABASE` и точные домены сайта через запятую в `RESTAURANT_HOSTS`. `RESTAURANT_DEV_HTTP` предназначена для локального запуска. Ограничьте прямой доступ к Waitress и настройте один прокси, который перезаписывает `X-Forwarded-For` и `X-Forwarded-Proto` реальными значениями. Nginx должен передавать исходный `Host` и направлять `/assets/menu.json` и `/assets/site-content.json` приложению, чтобы посетители получали опубликованные данные.

Команда `python -m flask --app restaurant_admin backup-db /path/to/new-backup.sqlite3` делает согласованную копию SQLite. Храните копии в закрытом месте. Для восстановления остановите приложение и замените рабочую базу проверенной копией вместе с удалением старых файлов WAL/SHM после чистой остановки.

Приёмка r_keeper выполняется отдельно. Для меню нужны версия установленного r_keeper, настроенный White Server и подтверждённый тип цен. Для броней уточните, где сотрудники уже ведут резервы.

## Проверки

```text
python -m unittest discover -s tests -p "test_restaurant_admin.py" -v
node --test tests/menu.spec.cjs
```

Для тестов публичного каталога нужны Playwright и Chromium. Путь к бинарнику при необходимости задаётся через `CHROMIUM_PATH`.
