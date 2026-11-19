"""Application entry point for the public site and the staff panel."""

import os
import re
import secrets
import sqlite3
from datetime import timedelta
from pathlib import Path

import click
from flask import (
    Flask, abort, flash, g, jsonify, redirect, render_template, request,
    send_from_directory, session, url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

from . import bookings, content
from .common import FormError, csrf_token, field, flash_error, integer, rate_allowed, role_required, verify_csrf
from .store import DEFAULTS, INITIAL_PROMO, ROOT, audit, close_db, db, history, init_db, original_catalog, transaction

PASSWORD_METHOD = "scrypt:65536:8:2"


def username_value(value):
    name = value.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]{2,39}", name):
        raise FormError("Логин должен содержать 3–40 латинских букв, цифр, точек, дефисов или подчёркиваний.")
    return name


def password_hash(password):
    if not 14 <= len(password) <= 128:
        raise FormError("Пароль должен содержать от 14 до 128 символов.")
    return generate_password_hash(password, method=PASSWORD_METHOD)


def create_app(test_config=None):
    app = Flask(__name__, instance_path=str(ROOT / "instance"), static_url_path="/admin-assets")
    development = os.environ.get("RESTAURANT_DEV_HTTP") == "1"
    hosts = os.environ.get("RESTAURANT_HOSTS", "localhost,127.0.0.1")
    app.config.update(
        DATABASE=os.environ.get("RESTAURANT_DATABASE", str(Path(app.instance_path) / "restaurant.sqlite3")),
        SECRET_KEY=os.environ.get("RESTAURANT_SECRET_KEY"),
        SESSION_COOKIE_NAME="restaurant_session",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=not development,
        SESSION_REFRESH_EACH_REQUEST=False,
        PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
        MAX_CONTENT_LENGTH=32768,
        MAX_FORM_MEMORY_SIZE=32768,
        TRUSTED_HOSTS=None if development and not hosts else [host.strip() for host in hosts.split(",")],
    )
    if test_config:
        app.config.update(test_config)
    if not app.secret_key or len(app.secret_key) < 32:
        raise RuntimeError("Set RESTAURANT_SECRET_KEY (at least 32 random characters).")
    app.config["DUMMY_PASSWORD_HASH"] = password_hash(secrets.token_urlsafe(32))
    app.teardown_appcontext(close_db)
    app.register_blueprint(content.bp)
    app.register_blueprint(bookings.bp)

    @app.before_request
    def authorize():
        g.user = None
        if not (request.path == "/admin" or request.path.startswith("/admin/")):
            return
        if "uid" in session:
            g.user = db().execute("SELECT * FROM staff WHERE id=? AND enabled=1", (session["uid"],)).fetchone()
            if not g.user or g.user["version"] != session.get("account_version"):
                g.user = None
                session.clear()
        if request.method == "POST":
            verify_csrf()

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.path.startswith("/admin") or request.path == "/booking":
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Robots-Tag"] = "noindex, nofollow"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' https:; "
                "font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
            )
        return response

    @app.context_processor
    def helpers():
        return {"csrf_token": csrf_token}

    @app.template_filter("time_display")
    def time_display(value):
        if not value:
            return "Не указано"
        return f"{value[8:10]}.{value[5:7]}.{value[:4]}, {value[11:16]}"

    @app.errorhandler(400)
    @app.errorhandler(403)
    @app.errorhandler(404)
    @app.errorhandler(413)
    def error_page(error):
        labels = {400: "Проверьте данные", 403: "Нет доступа", 404: "Страница не найдена", 413: "Запрос слишком большой"}
        return render_template("error.html", title=labels[error.code],
                               admin=request.path.startswith("/admin")), error.code

    @app.get("/admin")
    @app.get("/admin/")
    @role_required()
    def dashboard():
        return redirect(url_for("bookings.queue"))

    @app.route("/admin/login", methods=["GET", "POST"])
    def login():
        if g.user:
            return redirect(url_for("dashboard"))
        message = ""
        code = 200
        if request.method == "POST":
            if not rate_allowed("login", 12, 600):
                message, code = "Слишком много попыток. Попробуйте через несколько минут.", 429
            else:
                name = request.form.get("username", "").strip().lower()[:40]
                password = request.form.get("password", "")
                user = db().execute("SELECT * FROM staff WHERE username=? AND enabled=1", (name,)).fetchone()
                stored_hash = user["password"] if user else app.config["DUMMY_PASSWORD_HASH"]
                if len(password) <= 128 and check_password_hash(stored_hash, password) and user:
                    session.clear()
                    session.permanent = True
                    session["uid"] = user["id"]
                    session["account_version"] = user["version"]
                    return redirect(url_for("dashboard"), code=303)
                message, code = "Проверьте логин и пароль.", 401
        return render_template("admin/login.html", error=message), code

    @app.post("/admin/logout")
    @role_required()
    def logout():
        session.clear()
        return redirect(url_for("login"), code=303)

    @app.route("/admin/accounts", methods=["GET", "POST"])
    @role_required(manager=True)
    def accounts():
        if request.method == "POST":
            try:
                action = request.form.get("action")
                if action == "create":
                    username = username_value(request.form.get("username", ""))
                    name = field(request.form, "name", 80, "Имя", True)
                    role = request.form.get("role")
                    if role not in {"manager", "staff"}:
                        raise FormError("Выберите роль.")
                    hashed = password_hash(request.form.get("password", ""))
                    with transaction() as connection:
                        new_id = insert_account(connection, username, name, hashed, role)
                        audit(connection, g.user["id"], "account", new_id, "Добавлен сотрудник", name)
                elif action in {"toggle", "password"}:
                    user_id = integer(request.form, "user_id", 1, 100000000, "Сотрудник")
                    with transaction() as connection:
                        account = connection.execute("SELECT * FROM staff WHERE id=?", (user_id,)).fetchone()
                        if not account:
                            abort(404)
                        if action == "toggle":
                            if user_id == g.user["id"]:
                                raise FormError("Свой аккаунт отключить нельзя.")
                            enabled = not account["enabled"]
                            connection.execute("UPDATE staff SET enabled=?,version=version+1 WHERE id=?", (enabled, user_id))
                            label = "Доступ включён" if enabled else "Доступ отключён"
                        else:
                            hashed = password_hash(request.form.get("password", ""))
                            connection.execute("UPDATE staff SET password=?,version=version+1 WHERE id=?", (hashed, user_id))
                            label = "Пароль обновлён"
                        audit(connection, g.user["id"], "account", user_id, label, account["name"])
                    if action == "password" and user_id == g.user["id"]:
                        session.clear()
                        return redirect(url_for("login"), code=303)
                else:
                    abort(400)
                flash("Доступы сохранены.", "success")
            except FormError as exc:
                flash_error(exc)
            return redirect(url_for("accounts"), code=303)
        people = db().execute("SELECT id,name,username,role,enabled FROM staff ORDER BY enabled DESC,name").fetchall()
        return render_template("admin/accounts.html", people=people)

    @app.get("/admin/history")
    @role_required(manager=True)
    def journal():
        return render_template("admin/history.html", events=history())

    @app.get("/menu.html")
    @app.get("/index.html")
    @app.get("/")
    def public_page():
        filename = "menu.html" if request.path == "/menu.html" else "index.html"
        page = (ROOT / filename).read_text(encoding="utf-8")
        page = page.replace("</head>", '<script defer src="/assets/site-updates.js"></script></head>', 1)
        return app.response_class(page, mimetype="text/html")

    @app.get("/assets/menu.json")
    def live_menu():
        try:
            data = content.public_catalog()
        except sqlite3.Error:
            source = original_catalog()
            data = {"categories": source["categories"], "items": [
                {**dish, "priceRub": None} if not dish["priceVerified"] else dish for dish in source["items"]
            ]}
        response = jsonify(data)
        response.headers["Cache-Control"] = "public, max-age=20"
        return response

    @app.get("/assets/site-content.json")
    def live_content():
        try:
            settings, promos = content.public_settings(), content.public_promotions()
        except sqlite3.Error:
            settings, promos = DEFAULTS, [INITIAL_PROMO]
        response = jsonify(settings=settings, promotions=promos)
        response.headers["Cache-Control"] = "public, max-age=20"
        return response

    @app.get("/assets/<path:filename>")
    def asset(filename):
        return send_from_directory(ROOT / "assets", filename, conditional=True)

    @app.cli.command("init-db")
    def initialize():
        init_db()
        click.echo("База создана, каталог импортирован.")

    @app.cli.command("create-manager")
    @click.option("--username", prompt="Логин")
    @click.option("--name", prompt="Имя")
    @click.password_option()
    def create_manager(username, name, password):
        init_db()
        try:
            username = username_value(username)
            name = field({"name": name}, "name", 80, "Имя", True)
            with transaction() as connection:
                insert_account(connection, username, name, password_hash(password), "manager")
        except FormError as error:
            raise click.ClickException(str(error)) from error
        click.echo("Управляющий создан.")

    @app.cli.command("backup-db")
    @click.argument("destination", type=click.Path(path_type=Path))
    def backup(destination):
        source = Path(app.config["DATABASE"])
        if not source.is_file():
            raise click.ClickException("База ещё не создана.")
        try:
            descriptor = os.open(destination, os.O_EXCL | os.O_CREAT | os.O_WRONLY, 0o600)
        except OSError as exc:
            raise click.ClickException(str(exc)) from exc
        os.close(descriptor)
        try:
            target = sqlite3.connect(destination)
            try:
                db().backup(target)
            finally:
                target.close()
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
        click.echo("Резервная копия создана.")

    return app


def insert_account(connection, username, name, hashed, role):
    try:
        return connection.execute(
            "INSERT INTO staff(username,name,password,role) VALUES(?,?,?,?)", (username, name, hashed, role),
        ).lastrowid
    except sqlite3.IntegrityError as exc:
        raise FormError("Этот логин уже используется.") from exc
