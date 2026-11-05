"""Backend coverage for: ZIP contents of the Hostinger static export.

Criterion: /app/frontend/public/sevakendra-hostinger-live.zip contains index.html,
assets/, and .htaccess; contains no Supabase service-role key.
"""

import zipfile

ZIP_PATH = "/app/frontend/public/sevakendra-hostinger-live.zip"

# Patterns that would indicate a leaked Supabase service-role secret.
FORBIDDEN_PATTERNS = (b"service_role", b"SERVICE_ROLE", b"service-role")


def test_zip_contains_required_files_and_no_service_role_key():
    with zipfile.ZipFile(ZIP_PATH) as z:
        names = z.namelist()

        assert any(n == "index.html" or n.endswith("/index.html") for n in names), names
        assert any(n.startswith("assets/") for n in names), names
        assert any(n == ".htaccess" or n.endswith("/.htaccess") for n in names), names

        for n in names:
            if n.endswith("/"):
                continue
            data = z.read(n)
            for pattern in FORBIDDEN_PATTERNS:
                assert pattern not in data, f"Forbidden pattern {pattern!r} found in {n}"
