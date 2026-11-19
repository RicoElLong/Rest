"""Regression tests for the panel's protected and public workflows."""

import re
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

from restaurant_admin import create_app, insert_account, password_hash
from restaurant_admin.store import DEFAULTS, db, init_db, now, transaction


def csrf(response):
    return re.search(r'name="_csrf" value="([^"]+)"', response.get_data(as_text=True))[1]


def after(hours):
    return (now() + timedelta(hours=hours)).isoformat(timespec="minutes")


class AdminTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password = "fixture-LongPassword!25"
        cls.hashed = password_hash(cls.password)

    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.config = {
            "DATABASE": str(Path(folder.name) / "test.sqlite3"),
            "SECRET_KEY": "local-tests-" * 5,
            "SESSION_COOKIE_SECURE": False,
            "TESTING": True,
        }
        self.app = create_app(self.config)
        with self.app.app_context():
            init_db()
            with transaction() as connection:
                insert_account(connection, "manager", "Управляющий", self.hashed, "manager")
                insert_account(connection, "worker", "Сотрудник", self.hashed, "staff")
                insert_account(connection, "worker2", "Вторая смена", self.hashed, "staff")
        self.visitor = self.app.test_client()

    def login(self, username="manager"):
        client = self.app.test_client()
        response = client.post("/admin/login", data={
            "_csrf": csrf(client.get("/admin/login")), "username": username, "password": self.password,
        })
        self.assertEqual(response.status_code, 303)
        return client

    def post(self, client, path, **data):
        return client.post(path, data={"_csrf": csrf(client.get(path)), **data})

    def open_bookings(self, manager):
        self.assertEqual(self.post(
            manager, "/admin/settings", action="publish", version="1", booking="on",
            **{**{key: value for key, value in DEFAULTS.items() if key != "booking"},
               "privacy": "https://example.org/privacy", "hours": "12:00–23:00", "phone": "+79000000000"},
        ).status_code, 303)

    def test_admin_login_permissions_csrf_and_private_files(self):
        self.assertEqual(self.visitor.get("/admin").location, "/admin/login")
        self.assertEqual(self.visitor.post("/admin/login", data={}).status_code, 400)
        self.assertEqual(self.visitor.get("/admin/login").headers["Cache-Control"], "no-store")
        self.assertEqual(self.visitor.get("/.git/config").status_code, 404)
        self.assertEqual(self.visitor.get("/instance/restaurant.sqlite3").status_code, 404)
        staff = self.login("worker")
        self.assertEqual(staff.get("/admin/settings").status_code, 403)
        self.assertEqual(staff.get("/admin/accounts").status_code, 403)
        self.assertEqual(staff.get("/admin/dish/new").status_code, 403)

    def test_menu_drafts_preview_publish_restore_and_stop_list(self):
        manager = self.login()
        rows = self.visitor.get("/assets/menu.json").get_json()["items"]
        self.assertEqual(len(rows), 48)
        first = rows[0]
        self.assertIsNone(first["priceRub"])
        path = "/admin/dish/" + first["id"]
        payload = {"name": first["name"], "categoryId": first["categoryId"], "order": 10,
                   "priceRub": 820, "priceVerified": "on", "ingredients": "Лук", "allergens": "Горчица"}
        self.assertIn("Предпросмотр", self.post(manager, path, action="preview", version=1, **payload).get_data(as_text=True))
        self.assertEqual(self.post(manager, path, action="save", version=1, **payload).status_code, 303)
        self.assertIsNone(self.visitor.get("/assets/menu.json").get_json()["items"][0]["priceRub"])
        self.assertEqual(self.post(manager, path, action="publish", version=1, **payload).status_code, 422)
        self.assertEqual(self.post(manager, path, action="publish", version=2, **payload).status_code, 303)
        dish = self.visitor.get("/assets/menu.json").get_json()["items"][0]
        self.assertEqual((dish["priceRub"], dish["allergens"]), (820, "Горчица"))
        employee = self.login("worker")
        stop_path = f"/admin/menu/{first['id']}/stop"
        self.assertEqual(employee.post(stop_path, data={
            "_csrf": csrf(employee.get("/admin/menu")), "version": 3,
        }).status_code, 303)
        self.assertIs(self.visitor.get("/assets/menu.json").get_json()["items"][0]["available"], False)
        with self.app.app_context():
            revision = db().execute("SELECT id FROM revisions WHERE content_id=?", (first["id"],)).fetchone()["id"]
        self.assertEqual(self.post(manager, path, action="restore", version=4, revision_id=revision).status_code, 303)
        self.assertIsNone(self.visitor.get("/assets/menu.json").get_json()["items"][0]["priceRub"])

    def test_promotion_expiration_and_hide(self):
        manager = self.login()
        response = self.post(
            manager, "/admin/promo/new", action="publish",
            title="Тестовая акция", start=after(-2), end=after(-1), terms="Тест", cta="",
        )
        self.assertEqual(response.status_code, 303)
        self.assertEqual(len(self.visitor.get("/assets/site-content.json").get_json()["promotions"]), 1)
        self.assertEqual(self.post(manager, "/admin/promo/club", action="archive", version=1).status_code, 303)
        self.assertEqual(self.visitor.get("/assets/site-content.json").get_json()["promotions"], [])

    def test_public_submission_deduplication_and_booking_lifecycle(self):
        manager = self.login()
        self.assertEqual(self.visitor.get("/booking").status_code, 404)
        self.open_bookings(manager)
        self.assertNotIn("Заявка получена", self.visitor.get("/booking?sent=1").get_data(as_text=True))
        form = self.visitor.get("/booking")
        page = form.get_data(as_text=True)
        form_data = {"_csrf": csrf(form), "submission_key": re.search(r'name="submission_key" value="([^"]+)"', page)[1],
                     "name": "Тест Гость", "phone": "+7 (900) 123-45-67", "guests": 4,
                     "kind": "table", "desired_at": after(48), "consent": "on"}
        self.assertEqual(self.visitor.post("/booking", data={**form_data, "consent": ""}).status_code, 422)
        for _ in range(2):
            self.assertEqual(self.visitor.post("/booking", data=form_data).status_code, 303)
        queue = manager.get("/admin/bookings").get_data(as_text=True)
        self.assertEqual(queue.count("Тест Гость"), 1)
        worker = self.login("worker")
        other = self.login("worker2")
        booking = "/admin/bookings/1"
        self.assertEqual(self.post(worker, booking, action="claim", version=1).status_code, 303)
        response = other.post(booking, data={
            "_csrf": csrf(other.get(booking)), "action": "claim", "version": 1,
        }, follow_redirects=True)
        self.assertIn("Запись уже изменилась", response.get_data(as_text=True))
        self.assertEqual(self.post(other, booking, action="confirm", version=2).status_code, 403)
        self.assertEqual(self.post(worker, booking, action="callback", version=2, callback_at=after(3)).status_code, 303)
        self.assertIn("Тест Гость", worker.get("/admin/bookings?view=callback").get_data(as_text=True))
        self.assertEqual(self.post(worker, booking, action="contact", version=3).status_code, 303)
        self.assertEqual(self.post(worker, booking, action="confirm", version=4,
                                  confirmed_at=after(48), confirmed_guests=4, recorded="on").status_code, 303)
        self.assertIn("Бронь подтверждена", worker.get(booking).get_data(as_text=True))
        self.post(worker, booking, action="confirm", version=5, confirmed_at=after(49), confirmed_guests=4, recorded="on")
        self.post(worker, booking, action="cancel", version=6, reason="Изменились планы")
        self.assertIn("Бронь отменена", worker.get(booking).get_data(as_text=True))
        with create_app(self.config).app_context():
            self.assertEqual(db().execute("SELECT status FROM bookings WHERE id=1").fetchone()["status"], "cancelled")

    def test_banquet_without_date_and_manual_duplicate_warning(self):
        manager = self.login()
        self.open_bookings(manager)
        form = self.visitor.get("/booking?kind=banquet")
        key = re.search(r'name="submission_key" value="([^"]+)"', form.get_data(as_text=True))[1]
        response = self.visitor.post("/booking", data={
            "_csrf": csrf(form), "submission_key": key, "kind": "banquet", "name": "Гость",
            "phone": "89001234567", "guests": 30, "consent": "on",
        })
        self.assertEqual(response.status_code, 303)
        response = self.post(manager, "/admin/bookings/new", kind="banquet", source="phone", name="Гость",
                             phone="+79001234567", guests=30)
        self.assertEqual(response.status_code, 303)
        self.assertIn("Похожие заявки", manager.get(response.location).get_data(as_text=True))

    def test_disabling_account_revokes_its_session(self):
        manager = self.login()
        worker = self.login("worker")
        self.assertIn("Сотрудник", manager.get("/admin/accounts").get_data(as_text=True))
        self.post(manager, "/admin/accounts", action="toggle", user_id=2)
        self.assertEqual(worker.get("/admin/bookings").location, "/admin/login")


if __name__ == "__main__":
    unittest.main()
