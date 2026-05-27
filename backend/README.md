# TV Time Backend

FastAPI backend for the cinema reference service.

## Run

Install dependencies:

```powershell
python -m pip install -r backend/requirements.txt
```

Set database URL:

```powershell
$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/tv_time"
```

Start API:

```powershell
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

API docs:

```text
http://127.0.0.1:8000/docs
```

## Auth

Demo users from `db/init.sql`:

- `admin` / `admin`
- `client` / `client`

Login and registration return:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "user": {
    "id": 1,
    "login": "admin",
    "name": "Администратор",
    "email": "admin@tvtime.local",
    "role": "admin"
  }
}
```

Protected requests use:

```http
Authorization: Bearer <accessToken>
```

Posters are served from:

```text
/static/posters/<filename>
```
