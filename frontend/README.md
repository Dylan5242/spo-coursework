# TV Time Frontend

React/Vite frontend for the cinema reference service.

## Run

```powershell
npm install
npm run dev
```

Optional API URL:

```powershell
Copy-Item .env.example .env
```

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Expected Backend API

The frontend loads all domain data from the backend. It does not import poster files or hardcode seed data.

Main endpoints:

- `GET /api/bootstrap`
- `GET /api/movies`
- `POST /api/movies`
- `PUT /api/movies/{id}`
- `DELETE /api/movies/{id}`
- `GET /api/cinemas`
- `POST /api/cinemas`
- `PUT /api/cinemas/{id}`
- `DELETE /api/cinemas/{id}`
- `GET /api/sessions`
- `POST /api/sessions`
- `PUT /api/sessions/{id}`
- `DELETE /api/sessions/{id}`
- `GET /api/tickets/my`
- `POST /api/tickets`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

Poster URLs should come from the database as `posterUrl` or `poster_url`, for example:

```json
{
  "posterUrl": "/static/posters/fight_club.webp"
}
```

Relative poster URLs are resolved against `VITE_API_BASE_URL`.

## JWT Contract

`POST /api/auth/login` and `POST /api/auth/register` should return an access token and user data:

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "user": {
    "id": 1,
    "name": "Администратор",
    "email": "admin@tvtime.local",
    "role": "admin"
  }
}
```

Snake case is also supported: `access_token`, `refresh_token`.

The frontend sends authenticated requests with:

```http
Authorization: Bearer <accessToken>
```

When the backend returns `401 Unauthorized`, the frontend calls:

```http
POST /api/auth/refresh
```

The refresh endpoint may either use an `httpOnly` cookie or accept the JSON body:

```json
{
  "refreshToken": "jwt-refresh-token"
}
```
