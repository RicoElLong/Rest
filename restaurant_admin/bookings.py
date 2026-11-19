"""Guest requests and the staff booking queue."""

import re
from uuid import uuid4

from flask import Blueprint, abort, flash, g, redirect, render_template, request, session, url_for

from .common import (
    FormError, conflict, date_time, field, flash_error, integer, phone_number,
    rate_allowed, role_required, verify_csrf,
)
from .content import public_settings
from .store import audit, db, history, now, stamp, transaction

bp = Blueprint("bookings", __name__)
STATUS = {
    "new": "Новая", "working": "В работе", "confirmed": "Подтверждена",
    "closed": "Закрыта без брони", "cancelled": "Отменена",
}
TYPE = {"table": "Стол", "banquet": "Банкет"}
SOURCE = {"site": "Сайт", "phone": "Телефон", "messenger": "Мессенджер"}


def validate_booking(data, public=False):
    kind = data.get("kind")
    if kind not in TYPE:
        raise FormError("Выберите тип заявки.")
    desired = date_time(data, "desired_at", "Желаемая дата и время", kind == "table")
    if public and desired and desired < now().isoformat(timespec="minutes"):
        raise FormError("Выберите будущую дату и время.")
    return (
        kind, field(data, "name", 100, "Имя", True), phone_number(data),
        integer(data, "guests", 1, 500, "Число гостей"), desired,
        field(data, "comment", 1000, "Комментарий"),
    )


def insert_booking(connection, values, source, submission_key=None):
    return connection.execute(
        """INSERT INTO bookings(submission_key,kind,name,phone,guests,desired_at,comment,source,created_at)
           VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(submission_key) DO NOTHING""",
        (submission_key, *values, source, stamp()),
    ).lastrowid


@bp.route("/booking", methods=["GET", "POST"])
def public_form():
    settings = public_settings()
    if not settings["booking"] or not settings["privacy"]:
        abort(404)
    data = {"kind": request.args.get("kind", "table")}
    if data["kind"] not in TYPE:
        data["kind"] = "table"
    key = uuid4().hex
    error = None
    response_code = 200
    if request.method == "POST":
        verify_csrf()
        data = request.form
        key = data.get("submission_key", "")
        if not re.fullmatch(r"[0-9a-f]{32}", key):
            abort(400)
        try:
            existing = db().execute("SELECT 1 FROM bookings WHERE submission_key=?", (key,)).fetchone()
            if not existing:
                values = validate_booking(data, public=True)
                if data.get("consent") != "on":
                    raise FormError("Подтвердите, что ознакомились с политикой обработки данных.")
                if not rate_allowed("booking", 10, 600):
                    return render_template("booking.html", settings=settings, data=data, key=key,
                                           error="Слишком много попыток. Попробуйте через несколько минут."), 429
                with transaction() as connection:
                    if not public_settings()["booking"]:
                        abort(404)
                    insert_booking(connection, values, "site", key)
            session["booking_received"] = True
            return redirect(url_for("bookings.public_form", sent="1"), code=303)
        except FormError as exc:
            error = str(exc)
            response_code = 422
    return render_template(
        "booking.html", settings=settings, data=data, key=key, error=error,
        sent=request.method == "GET" and request.args.get("sent") == "1" and session.get("booking_received"),
        earliest=now().isoformat(timespec="minutes"),
    ), response_code


@bp.get("/admin/bookings")
@role_required()
def queue():
    today = now().date().isoformat()
    date_filter = "substr(COALESCE(confirmed_at,desired_at),1,10)=? AND status NOT IN ('closed','cancelled')"
    filters = {
        "all": ("1=1", ()), "new": ("status='new'", ()),
        "callback": ("status='working' AND callback_at IS NOT NULL", ()),
        "today": (date_filter, (today,)),
    }
    key = request.args.get("view", "all")
    key = key if key in filters else "all"
    page = max(1, min(request.args.get("page", 1, type=int), 100000))
    counts = {
        name: db().execute(f"SELECT COUNT(*) FROM bookings WHERE {where}", args).fetchone()[0]
        for name, (where, args) in filters.items()
    }
    where, args = filters[key]
    order = "bookings.callback_at, bookings.id" if key == "callback" else (
        "COALESCE(bookings.confirmed_at,bookings.desired_at), bookings.id" if key == "today" else
        "CASE bookings.status WHEN 'new' THEN 0 WHEN 'working' THEN 1 ELSE 2 END, bookings.id DESC"
    )
    entries = db().execute(
        f"""SELECT bookings.*, staff.name AS owner_name FROM bookings LEFT JOIN staff ON staff.id=bookings.owner
            WHERE {where} ORDER BY {order} LIMIT 30 OFFSET ?""", (*args, (page - 1) * 30)
    ).fetchall()
    return render_template(
        "admin/queue.html", entries=entries, view=key, counts=counts, now=stamp(), context_today=now().date(),
        page=page, has_next=counts[key] > page * 30, status=STATUS, types=TYPE, sources=SOURCE,
    )


@bp.route("/admin/bookings/new", methods=["GET", "POST"])
@role_required()
def manual():
    error = None
    data = {"kind": "table", "source": "phone"}
    if request.method == "POST":
        data = request.form
        try:
            values = validate_booking(data)
            source = data.get("source")
            if source not in {"phone", "messenger"}:
                raise FormError("Выберите, откуда пришла заявка.")
            with transaction() as connection:
                booking_id = insert_booking(connection, values, source)
                audit(connection, g.user["id"], "booking", booking_id, "Добавлена заявка", SOURCE[source])
            return redirect(url_for("bookings.detail", booking_id=booking_id), code=303)
        except FormError as exc:
            error = str(exc)
    return render_template("admin/manual.html", data=data, error=error), 422 if error else 200


def booking_by_id(booking_id):
    row = db().execute(
        """SELECT bookings.*,staff.name AS owner_name FROM bookings
           LEFT JOIN staff ON staff.id=bookings.owner WHERE bookings.id=?""", (booking_id,),
    ).fetchone()
    if row is None:
        abort(404)
    return row


def permitted(current, user):
    return user["role"] == "manager" or current["owner"] == user["id"]


def set_booking(connection, current, action, data):
    status = current["status"]
    owner = current["owner"]
    user = g.user
    version = integer(data, "version", 1, 100000000, "Версия")
    if version != current["version"]:
        conflict()

    updates = {}
    detail = ""
    label = ""
    if action == "claim" and status == "new" and owner is None:
        updates = {"status": "working", "owner": user["id"]}
        label = "Взята в работу"
    elif action == "assign" and user["role"] == "manager" and status in {"new", "working", "confirmed"}:
        owner_id = integer(data, "owner", 1, 100000000, "Ответственный")
        person = connection.execute("SELECT id,name FROM staff WHERE id=? AND enabled=1", (owner_id,)).fetchone()
        if person is None:
            raise FormError("Выберите действующего сотрудника.")
        updates = {"owner": owner_id, "status": "working" if status == "new" else status}
        label, detail = "Назначен ответственный", person["name"]
    elif not permitted(current, user):
        abort(403)
    elif action == "reopen" and user["role"] == "manager" and status in {"closed", "cancelled"}:
        detail = field(data, "reason", 500, "Причина", True)
        updates = {"status": "working", "owner": user["id"], "callback_at": None,
                   "confirmed_at": None, "confirmed_guests": None}
        label = "Возвращена в работу"
    elif action in {"contact", "callback", "note"} and status in {"working", "confirmed"}:
        if action == "contact":
            updates = {"contacted_at": current["contacted_at"] or stamp(), "callback_at": None}
            label = "Связались с гостем"
        elif action == "callback":
            callback = date_time(data, "callback_at", "Перезвонить", True)
            if callback <= now().isoformat(timespec="minutes"):
                raise FormError("Укажите будущее время перезвона.")
            updates = {"callback_at": callback}
            label, detail = "Назначен перезвон", callback.replace("T", " ")
        else:
            detail = field(data, "note", 1000, "Комментарий", True)
            label = "Добавлен комментарий"
    elif action == "confirm" and status in {"working", "confirmed"}:
        when = date_time(data, "confirmed_at", "Согласованное время", True)
        if when < now().isoformat(timespec="minutes"):
            raise FormError("Укажите будущее время визита.")
        guests = integer(data, "confirmed_guests", 1, 500, "Согласованное число гостей")
        if data.get("recorded") != "on":
            raise FormError("Сначала внесите подтверждение в журнал ресторана.")
        updates = {"confirmed_at": when, "confirmed_guests": guests, "status": "confirmed",
                   "callback_at": None, "contacted_at": current["contacted_at"] or stamp()}
        label = "Бронь перенесена" if status == "confirmed" else "Бронь подтверждена"
        detail = f'{when.replace("T", " ")} · гостей {guests}'
    elif (action == "close" and status == "working") or (action == "cancel" and status == "confirmed"):
        detail = field(data, "reason", 500, "Причина", True)
        updates = {"status": "closed" if action == "close" else "cancelled", "callback_at": None}
        label = "Закрыта без брони" if action == "close" else "Бронь отменена"
    else:
        raise FormError("Действие недоступно для текущего статуса.")
    setters = ", ".join(f"{key}=?" for key in updates)
    values = [*updates.values(), current["id"]]
    connection.execute(f"UPDATE bookings SET {setters + ', ' if setters else ''}version=version+1 WHERE id=?", values)
    audit(connection, user["id"], "booking", current["id"], label, detail)


@bp.route("/admin/bookings/<int:booking_id>", methods=["GET", "POST"])
@role_required()
def detail(booking_id):
    if request.method == "POST":
        try:
            with transaction() as connection:
                row = booking_by_id(booking_id)
                set_booking(connection, row, request.form.get("action", ""), request.form)
            flash("Изменения сохранены.", "success")
        except FormError as exc:
            flash_error(exc)
        return redirect(url_for("bookings.detail", booking_id=booking_id), code=303)
    row = booking_by_id(booking_id)
    matches = db().execute(
        """SELECT id,kind,status,desired_at FROM bookings WHERE id<>? AND phone=?
           AND (desired_at IS NULL OR ? IS NULL OR substr(desired_at,1,10)=substr(?,1,10)) ORDER BY id DESC LIMIT 8""",
        (booking_id, row["phone"], row["desired_at"], row["desired_at"]),
    ).fetchall()
    staff = db().execute("SELECT id,name FROM staff WHERE enabled=1 ORDER BY name").fetchall() if g.user["role"] == "manager" else []
    return render_template(
        "admin/detail.html", entry=row, matches=matches, staff=staff, events=history("booking", booking_id),
        can_edit=permitted(row, g.user), status=STATUS, types=TYPE, sources=SOURCE,
    )
