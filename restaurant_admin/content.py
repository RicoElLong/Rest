"""Versioned menu, promotions and restaurant settings."""

import re
from urllib.parse import urlsplit
from uuid import uuid4

from flask import Blueprint, abort, flash, g, redirect, render_template, request, url_for

from .common import (
    FormError, conflict, date_time, field, flash_error, https_url, integer,
    phone_number, role_required,
)
from .store import DEFAULTS, audit, db, decode, encode, now, original_catalog, stamp, transaction

bp = Blueprint("content", __name__, url_prefix="/admin")
LABELS = {"dish": "Блюдо", "promo": "Акция", "settings": "Настройки сайта"}


def row_for(kind, item_id):
    return db().execute("SELECT * FROM content WHERE kind=? AND id=?", (kind, item_id)).fetchone()


def rows_for(kind):
    return db().execute("SELECT * FROM content WHERE kind=? ORDER BY rowid", (kind,)).fetchall()


def categories():
    return original_catalog()["categories"]


def public_settings():
    row = row_for("settings", "site")
    return decode(row["live"]) if row else DEFAULTS


def public_promotions():
    current = now().isoformat(timespec="minutes")
    return [
        promo for row in rows_for("promo") if not row["stopped"] and (promo := decode(row["live"]))
        and (not promo["start"] or promo["start"] <= current)
        and (not promo["end"] or promo["end"] > current)
    ]


def public_catalog():
    dishes = []
    for row in rows_for("dish"):
        dish = decode(row["live"])
        if dish is not None:
            if row["stopped"]:
                dish["available"] = False
            dishes.append(dish)
    return {
        "restaurant": "Дети лейтенанта Шмидта", "locale": "ru-RU", "currency": "RUB",
        "categories": categories(), "items": sorted(dishes, key=lambda dish: dish["order"]),
    }


def photo(data):
    value = field(data, "image", 1000, "Фотография")
    if not value:
        return None
    if re.fullmatch(r"assets/[A-Za-z0-9_./-]+\.(?:jpeg|jpg|webp|png|avif)", value, re.I) and ".." not in value.split("/"):
        return value
    return https_url(data, "image", "Фотография")


def validate_dish(data, old, item_id):
    category = field(data, "categoryId", 64, "Категория", True)
    if category not in {item["id"] for item in categories()}:
        raise FormError("Выберите категорию меню.")
    price = integer(data, "priceRub", 1, 1000000, "Цена", required=False)
    verified = data.get("priceVerified") == "on"
    if verified and price is None:
        raise FormError("Укажите подтверждённую цену.")
    description = field(data, "description", 2000, "Описание")
    ingredients = field(data, "ingredients", 700, "Состав")
    image = photo(data)
    return {
        **old, "id": item_id, "categoryId": category, "priceRub": price, "priceVerified": verified,
        "name": field(data, "name", 120, "Название", True),
        "order": integer(data, "order", 0, 1000000, "Порядок"),
        "weightGrams": integer(data, "weightGrams", 1, 100000, "Вес", required=False),
        "description": description or None,
        "ingredients": ingredients or None,
        "allergens": field(data, "allergens", 500, "Аллергены"),
        "image": image, "imageStatus": "provided" if image else "missing",
    }


def validate_promo(data, _old, _item_id):
    start = date_time(data, "start", "Начало")
    end = date_time(data, "end", "Окончание")
    if start and end and end <= start:
        raise FormError("Окончание акции должно быть позднее начала.")
    cta = field(data, "cta", 80, "Текст кнопки")
    url = https_url(data, "url", "Ссылка кнопки", bool(cta))
    if url and not cta:
        raise FormError("Добавьте текст кнопки.")
    return {
        "title": field(data, "title", 240, "Название", True), "image": photo(data),
        "start": start, "end": end, "cta": cta, "url": url,
        "terms": field(data, "terms", 2000, "Условия"),
    }


def validate_settings(data, _old, _item_id):
    phone = phone_number(data)
    privacy = https_url(data, "privacy", "Политика обработки данных")
    map_url = https_url(data, "map_url", "Яндекс Карты", True)
    map_parts = urlsplit(map_url)
    if map_parts.hostname != "yandex.ru" or not re.fullmatch(r"/maps/org/(?:[^/]+/)?146001632122/?", map_parts.path):
        raise FormError("Укажите точную карточку ресторана в Яндекс Картах.")
    telegram = https_url(data, "telegram", "Telegram", required=True)
    telegram_parts = urlsplit(telegram)
    if telegram_parts.hostname != "t.me" or not re.fullmatch(r"/[A-Za-z0-9_]+/?", telegram_parts.path) or telegram_parts.query or telegram_parts.fragment:
        raise FormError("Укажите основную ссылку t.me на бота или канал.")
    booking = data.get("booking") == "on"
    if booking and not privacy:
        raise FormError("Добавьте ссылку на политику обработки данных для включения формы.")
    if booking and phone == DEFAULTS["phone"]:
        raise FormError("Укажите рабочий телефон ресторана для включения формы.")
    return {
        "phone": phone, "privacy": privacy, "map_url": map_url, "telegram": telegram,
        "booking": booking, "delivery": https_url(data, "delivery", "Доставка", True),
        "address": field(data, "address", 150, "Адрес", True),
        "hours": field(data, "hours", 150, "Часы работы"),
    }


VALIDATORS = {"dish": validate_dish, "promo": validate_promo, "settings": validate_settings}


def same_version(row, data):
    version = integer(data, "version", 1, 100000000, "Версия") if row else 0
    if row and row["version"] != version:
        conflict()


def remember(connection, row):
    connection.execute(
        "INSERT INTO revisions(kind,content_id,payload,author,at) VALUES(?,?,?,?,?)",
        (row["kind"], row["id"], row["live"], g.user["id"], stamp()),
    )


def editor(kind, item_id):
    row = row_for(kind, item_id) if item_id else None
    if item_id and row is None:
        abort(404)
    old = decode(row["draft"]) if row else {}
    name = old.get("name") or old.get("title") or LABELS[kind]
    data = old or ({"order": 1000} if kind == "dish" else {})
    preview = False
    error = None
    if request.method == "POST":
        try:
            action = request.form.get("action", "")
            if action not in {"preview", "save", "publish", "archive", "restore"}:
                abort(400)
            with transaction() as connection:
                active = row_for(kind, item_id) if item_id else None
                same_version(active, request.form)
                if action == "preview":
                    data = VALIDATORS[kind](request.form, old, item_id)
                    preview = True
                elif action == "restore" and active:
                    revision_id = integer(request.form, "revision_id", 1, 100000000, "Версия публикации")
                    revision = connection.execute(
                        "SELECT payload FROM revisions WHERE id=? AND kind=? AND content_id=?",
                        (revision_id, kind, item_id),
                    ).fetchone()
                    if revision is None:
                        abort(404)
                    remember(connection, active)
                    connection.execute(
                        "UPDATE content SET live=?,version=version+1 WHERE kind=? AND id=?",
                        (revision["payload"], kind, item_id),
                    )
                    audit(connection, g.user["id"], kind, item_id, "Восстановлена версия", name)
                elif action == "archive" and active and kind != "settings":
                    remember(connection, active)
                    connection.execute("UPDATE content SET live=NULL,version=version+1 WHERE kind=? AND id=?", (kind, item_id))
                    audit(connection, g.user["id"], kind, item_id, "Снято с публикации", name)
                elif action in {"save", "publish"}:
                    new_id = item_id or uuid4().hex
                    data = VALIDATORS[kind](request.form, old, new_id)
                    if action == "publish" and kind == "dish" and not data["priceVerified"]:
                        raise FormError("Подтвердите цену перед публикацией блюда.")
                    if active is None:
                        connection.execute("INSERT INTO content(kind,id,draft) VALUES(?,?,?)", (kind, new_id, encode(data)))
                        active = row_for(kind, new_id)
                    previous = decode(active["live"]) or {}
                    detail = data.get("name") or data.get("title") or LABELS[kind]
                    if action == "publish":
                        remember(connection, active)
                        if kind == "dish" and previous.get("priceRub") != data["priceRub"]:
                            detail += f' · {previous.get("priceRub") or "—"} → {data["priceRub"]} ₽'
                        connection.execute(
                            "UPDATE content SET live=? WHERE kind=? AND id=?",
                            (encode(data), kind, new_id),
                        )
                    connection.execute(
                        "UPDATE content SET draft=?,version=version+1 WHERE kind=? AND id=?",
                        (encode(data), kind, new_id),
                    )
                    audit(connection, g.user["id"], kind, new_id, "Опубликовано" if action == "publish" else "Черновик сохранён", detail)
                    item_id = new_id
                else:
                    abort(400)
            if action != "preview":
                flash({"save": "Черновик сохранён.", "publish": "Изменения опубликованы.",
                       "archive": "Показ на сайте отключён.", "restore": "Версия восстановлена."}[action], "success")
                return redirect(editor_url(kind, item_id), code=303)
        except FormError as exc:
            error = str(exc)
            if action in {"preview", "save", "publish"}:
                data = {**old, **request.form.to_dict(),
                        "priceVerified": request.form.get("priceVerified") == "on",
                        "booking": request.form.get("booking") == "on"}
    versions = db().execute(
        "SELECT id,payload,at FROM revisions WHERE kind=? AND content_id=? ORDER BY id DESC LIMIT 12",
        (kind, item_id),
    ).fetchall()
    return render_template(
        "admin/edit.html", kind=kind, title=name, data=data, item=row, categories=categories(),
        preview=preview, error=error, versions=versions, back=list_url(kind),
    ), 422 if error else 200


def list_url(kind):
    endpoint = {"dish": "content.menu", "promo": "content.promos", "settings": "content.settings"}[kind]
    return url_for(endpoint)


def editor_url(kind, item_id):
    return url_for("content.settings") if kind == "settings" else url_for("content.edit", kind=kind, item_id=item_id)


@bp.get("/menu")
@role_required()
def menu():
    query = request.args.get("q", "").strip()[:120]
    category = request.args.get("category", "")
    rows = []
    for row in rows_for("dish"):
        live = decode(row["live"])
        dish = decode(row["draft"]) if g.user["role"] == "manager" else live
        if not dish:
            continue
        if (category and dish["categoryId"] != category) or (query and query.casefold() not in dish["name"].casefold()):
            continue
        rows.append((row, dish, live))
    rows.sort(key=lambda entry: entry[1]["order"])
    return render_template("admin/menu.html", items=rows, categories=categories(), query=query, category=category)


@bp.get("/promotions")
@role_required()
def promos():
    active = public_promotions()
    rows = []
    for row in rows_for("promo"):
        live = decode(row["live"])
        if live or g.user["role"] == "manager":
            rows.append((row, decode(row["draft"]) if g.user["role"] == "manager" else live, live in active))
    return render_template("admin/promos.html", items=rows)


@bp.route("/settings", methods=["GET", "POST"])
@role_required(manager=True)
def settings():
    return editor("settings", "site")


@bp.route("/<any(dish,promo):kind>/new", methods=["GET", "POST"])
@role_required(manager=True)
def create(kind):
    return editor(kind, None)


@bp.route("/<any(dish,promo):kind>/<item_id>", methods=["GET", "POST"])
@role_required(manager=True)
def edit(kind, item_id):
    return editor(kind, item_id)


@bp.post("/menu/<item_id>/stop")
@role_required()
def stop(item_id):
    try:
        with transaction() as connection:
            row = row_for("dish", item_id)
            if row is None or row["live"] is None:
                abort(404)
            same_version(row, request.form)
            stopped = not row["stopped"]
            connection.execute(
                "UPDATE content SET stopped=?,version=version+1 WHERE kind='dish' AND id=?", (stopped, item_id)
            )
            action = "Поставлено в стоп-лист" if stopped else "Снято со стоп-листа"
            audit(connection, g.user["id"], "dish", item_id, action, decode(row["live"])["name"])
        flash(action + ".", "success")
    except FormError as exc:
        flash_error(exc)
    return redirect(url_for("content.menu", q=request.form.get("q", ""), category=request.form.get("category", "")), code=303)
