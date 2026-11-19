"""Shared input validation and access controls."""

import hmac
import ipaddress
import re
import secrets
import time
from datetime import datetime
from functools import wraps
from urllib.parse import urlsplit

from flask import abort, flash, g, redirect, request, session, url_for

from .store import db, transaction


class FormError(ValueError):
    pass


def field(data, name, limit, label, required=False):
    value = data.get(name, "").strip()
    if len(value) > limit:
        raise FormError(f'Поле «{label}» слишком длинное.')
    if required and not value:
        raise FormError(f'Заполните поле «{label}».')
    return value


def integer(data, name, low, high, label, required=True):
    value = data.get(name, "").strip()
    if not value and not required:
        return None
    try:
        result = int(value)
        if low <= result <= high:
            return result
    except ValueError:
        pass
    raise FormError(f'В поле «{label}» укажите число от {low} до {high}.')


def phone_number(data):
    value = field(data, "phone", 24, "Телефон", required=True)
    if not re.fullmatch(r"[+0-9() .-]+", value):
        raise FormError("Проверьте номер телефона.")
    digits = re.sub(r"[^0-9]", "", value)
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if not 10 <= len(digits) <= 15 or digits.startswith("0"):
        raise FormError("Укажите телефон с кодом страны.")
    if len(digits) == 10 and not value.startswith("+"):
        digits = "7" + digits
    return "+" + digits


def date_time(data, name, label, required=False):
    value = field(data, name, 16, label, required)
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M").isoformat(timespec="minutes")
    except ValueError as exc:
        raise FormError(f'Проверьте дату и время в поле «{label}».') from exc


def https_url(data, name, label, required=False):
    value = field(data, name, 1000, label, required)
    if not value:
        return ""
    if any(char.isspace() or ord(char) < 32 or char == "\\" for char in value):
        raise FormError(f'В поле «{label}» укажите HTTPS-ссылку.')
    try:
        parsed = urlsplit(value)
        if parsed.scheme == "https" and parsed.hostname and parsed.username is None and parsed.password is None:
            return value
    except ValueError:
        pass
    raise FormError(f'В поле «{label}» укажите HTTPS-ссылку.')


def role_required(manager=False):
    def decorate(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if g.user is None:
                return redirect(url_for("login"))
            if manager and g.user["role"] != "manager":
                abort(403)
            return view(*args, **kwargs)

        return wrapped

    return decorate


def csrf_token():
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_urlsafe(32)
    return session["_csrf"]


def verify_csrf():
    expected = session.get("_csrf")
    provided = request.form.get("_csrf", "")
    if not expected or not provided.isascii() or not hmac.compare_digest(expected, provided):
        abort(400, "Обновите страницу и попробуйте ещё раз.")


def rate_allowed(bucket, capacity, seconds):
    current = int(time.time())
    address = request.remote_addr or "unknown"
    try:
        ip = ipaddress.ip_address(address)
        if ip.version == 6:
            address = str(ipaddress.ip_network(f"{ip}/64", strict=False))
    except ValueError:
        address = "unknown"
    with transaction() as connection:
        connection.execute("DELETE FROM limits WHERE expires <= ?", (current,))
        row = connection.execute(
            "SELECT hits FROM limits WHERE bucket=? AND client=?", (bucket, address)
        ).fetchone()
        if row is not None and row["hits"] >= capacity:
            return False
        connection.execute(
            "INSERT INTO limits VALUES(?,?,?,1) ON CONFLICT(bucket,client) DO UPDATE SET hits=hits+1",
            (bucket, address, current + seconds),
        )
    return True


def conflict():
    raise FormError("Запись уже изменилась. Проверьте актуальные данные и повторите действие.")


def flash_error(error):
    flash(str(error), "error")
