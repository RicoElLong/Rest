"""SQLite storage shared by the admin panel and the public site."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import current_app, g

ROOT = Path(__file__).resolve().parent.parent
SAMARA = ZoneInfo("Europe/Samara")
DEFAULTS = {
    "phone": "+78920000000",
    "hours": "",
    "address": "Самара, улица Лейтенанта Шмидта, 1В",
    "map_url": "https://yandex.ru/maps/org/deti_leytenanta_shmidta/146001632122/",
    "telegram": "https://t.me/RESTSCHMIDTBOT",
    "delivery": "https://eda.yandex.ru/r/subway?placeSlug=deti_lejtenanta_shmidta",
    "privacy": "",
    "booking": False,
}
INITIAL_PROMO = {
    "title": "Переходите в наши мессенджеры и получайте скидочные акции и подарки.",
    "image": "assets/promotions-volga-dark-gold.webp",
    "terms": "",
    "start": "",
    "end": "",
    "cta": "Открыть Telegram",
    "url": "https://t.me/RESTSCHMIDTBOT?start=src_site_promotions",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
    enabled INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS content (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    draft TEXT NOT NULL,
    live TEXT,
    stopped INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS revisions (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    content_id TEXT NOT NULL,
    payload TEXT,
    author INTEGER NOT NULL REFERENCES staff(id),
    at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS revisions_content ON revisions(kind, content_id, id);
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY,
    submission_key TEXT UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('table', 'banquet')),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    guests INTEGER NOT NULL,
    desired_at TEXT,
    confirmed_at TEXT,
    confirmed_guests INTEGER,
    comment TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('site', 'phone', 'messenger')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'working', 'confirmed', 'closed', 'cancelled')),
    owner INTEGER REFERENCES staff(id),
    callback_at TEXT,
    contacted_at TEXT,
    created_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS bookings_by_phone ON bookings(phone, desired_at);
CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY,
    author INTEGER NOT NULL REFERENCES staff(id),
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_entity ON audit(entity, entity_id, id);
CREATE TABLE IF NOT EXISTS limits (
    bucket TEXT NOT NULL,
    client TEXT NOT NULL,
    expires INTEGER NOT NULL,
    hits INTEGER NOT NULL,
    PRIMARY KEY (bucket, client)
);
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY);
"""


def now():
    return datetime.now(SAMARA).replace(tzinfo=None)


def stamp():
    return now().isoformat(timespec="seconds")


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def decode(value):
    return json.loads(value) if value is not None else None


def original_catalog():
    return json.loads((ROOT / "assets/menu.json").read_text(encoding="utf-8"))


def db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"], timeout=5, isolation_level=None)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_error=None):
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


@contextmanager
def transaction():
    connection = db()
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise


def init_db():
    path = Path(current_app.config["DATABASE"])
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.touch(exist_ok=True, mode=0o600)
    path.chmod(0o600)
    connection = db()
    connection.execute("PRAGMA journal_mode = WAL")
    connection.executescript(SCHEMA)
    with transaction():
        if connection.execute("SELECT 1 FROM metadata WHERE key='catalog_imported'").fetchone():
            return
        for index, dish in enumerate(original_catalog()["items"], start=1):
            draft = {**dish, "order": index * 10, "allergens": dish.get("allergens") or ""}
            # Keep catalogue navigation working, while removing unverified prices from the public payload.
            live = {**draft, "priceRub": None} if not draft.get("priceVerified") else draft
            connection.execute(
                "INSERT INTO content(kind,id,draft,live) VALUES('dish',?,?,?)",
                (draft["id"], encode(draft), encode(live)),
            )
        connection.execute(
            "INSERT INTO content(kind,id,draft,live) VALUES('settings','site',?,?)",
            (encode(DEFAULTS), encode(DEFAULTS)),
        )
        connection.execute(
            "INSERT INTO content(kind,id,draft,live) VALUES('promo','club',?,?)",
            (encode(INITIAL_PROMO), encode(INITIAL_PROMO)),
        )
        connection.execute("INSERT INTO metadata VALUES('catalog_imported')")


def audit(connection, author, entity, entity_id, action, detail=""):
    connection.execute(
        "INSERT INTO audit(author,entity,entity_id,action,detail,at) VALUES(?,?,?,?,?,?)",
        (author, entity, str(entity_id), action, detail, stamp()),
    )


def history(entity=None, entity_id=None):
    sql = "SELECT audit.*, staff.name FROM audit JOIN staff ON audit.author=staff.id"
    if entity is None:
        return db().execute(sql + " ORDER BY audit.id DESC LIMIT 75").fetchall()
    return db().execute(
        sql + " WHERE entity=? AND entity_id=? ORDER BY audit.id DESC LIMIT 75", (entity, str(entity_id))
    ).fetchall()
