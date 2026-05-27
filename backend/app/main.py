from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Annotated

import psycopg
from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import BASE_DIR, get_settings
from .db import get_conn
from .schemas import (
    CinemaPayload,
    LoginRequest,
    MoviePayload,
    RefreshRequest,
    RegisterRequest,
    SessionPayload,
    TicketPayload,
)
from .security import create_token, decode_token, hash_password, verify_password


app = FastAPI(title="TV Time API")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.posters_dir.exists():
    app.mount("/static/posters", StaticFiles(directory=settings.posters_dir), name="posters")


def row_to_user(row: dict | None) -> dict | None:
    if not row:
        return None
    return {
        "id": row["id"],
        "login": row["login"],
        "name": row["full_name"],
        "email": row["email"],
        "phone": row["phone"],
        "role": row["role_code"],
    }


def user_by_id(user_id: int) -> dict | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.login, u.full_name, u.email, u.phone, r.code AS role_code
                FROM users u
                JOIN roles r ON r.id = u.role_id
                WHERE u.id = %s
                """,
                (user_id,),
            )
            return row_to_user(cur.fetchone())


def current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authorization token is required")

    token = authorization.split(" ", 1)[1]
    user_id = decode_token(token, "access")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token")

    user = user_by_id(user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


def optional_user(authorization: Annotated[str | None, Header()] = None) -> dict | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    user_id = decode_token(token, "access")
    return user_by_id(user_id) if user_id else None


def admin_user(user: Annotated[dict, Depends(current_user)]) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role is required")
    return user


def issue_tokens(user: dict, response: Response) -> dict:
    access_token = create_token(user["id"], "access")
    refresh_token = create_token(user["id"], "refresh")
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=settings.jwt_refresh_days * 24 * 60 * 60,
    )
    return {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "user": user,
    }


def parse_dt(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid datetime") from exc


def movie_row(row: dict) -> dict:
    genres = row.get("genres") or []
    if isinstance(genres, str):
        genres = [item.strip() for item in genres.split(",") if item.strip()]
    return {
        "id": row["id"],
        "title": row["title"],
        "director": row["director"],
        "studio": row["studio"],
        "actors": row["actors"],
        "genres": genres,
        "ageRating": row["age_rating"],
        "duration": row["duration_minutes"],
        "description": row["description"],
        "posterUrl": row["poster_url"],
    }


def hall_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "rows": row["rows_count"],
        "seatsPerRow": row["seats_per_row"],
    }


def session_row(row: dict) -> dict:
    occupied = row.get("occupied_seats") or []
    return {
        "id": row["id"],
        "movieId": row["movie_id"],
        "cinemaId": row["cinema_id"],
        "hallId": row["hall_id"],
        "startsAt": row["starts_at"].isoformat(timespec="minutes"),
        "price": float(row["price"]),
        "occupiedSeats": occupied,
        "freeSeats": row.get("free_seats"),
        "totalSeats": row.get("total_seats"),
    }


def ticket_row(row: dict) -> dict:
    return {
        "id": row["id"],
        "sessionId": row["session_id"],
        "seats": row.get("seats") or [],
        "customerName": row["customer_name"],
        "customerEmail": row["customer_email"],
        "total": float(row["total_price"]),
        "createdAt": row["created_at"].isoformat(),
    }


def list_movies() -> list[dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    m.*,
                    COALESCE(array_agg(g.name ORDER BY g.name) FILTER (WHERE g.id IS NOT NULL), '{}') AS genres
                FROM movies m
                LEFT JOIN movie_genres mg ON mg.movie_id = m.id
                LEFT JOIN genres g ON g.id = mg.genre_id
                GROUP BY m.id
                ORDER BY m.id
                """
            )
            return [movie_row(row) for row in cur.fetchall()]


def list_cinemas() -> list[dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cinemas ORDER BY id")
            cinemas = list(cur.fetchall())
            cur.execute("SELECT * FROM halls ORDER BY cinema_id, id")
            halls = list(cur.fetchall())

    halls_by_cinema: dict[int, list[dict]] = {}
    for hall in halls:
        halls_by_cinema.setdefault(hall["cinema_id"], []).append(hall_row(hall))

    return [
        {
            "id": cinema["id"],
            "name": cinema["name"],
            "address": cinema["address"],
            "district": cinema["district"],
            "phone": cinema["phone"],
            "halls": halls_by_cinema.get(cinema["id"], []),
        }
        for cinema in cinemas
    ]


def list_sessions() -> list[dict]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    s.id,
                    s.movie_id,
                    h.cinema_id,
                    s.hall_id,
                    s.starts_at,
                    s.price,
                    count(st.id)::int AS total_seats,
                    (count(st.id) - count(ts.seat_id) FILTER (WHERE t.status <> 'cancelled'))::int AS free_seats,
                    COALESCE(
                        array_agg(st.row_label || st.seat_number ORDER BY st.row_label, st.seat_number)
                            FILTER (WHERE ts.seat_id IS NOT NULL AND t.status <> 'cancelled'),
                        '{}'
                    ) AS occupied_seats
                FROM sessions s
                JOIN halls h ON h.id = s.hall_id
                JOIN seats st ON st.hall_id = h.id
                LEFT JOIN ticket_seats ts ON ts.session_id = s.id AND ts.seat_id = st.id
                LEFT JOIN tickets t ON t.id = ts.ticket_id
                GROUP BY s.id, h.cinema_id
                ORDER BY s.starts_at, s.id
                """
            )
            return [session_row(row) for row in cur.fetchall()]


def list_tickets(user: dict | None) -> list[dict]:
    if not user:
        return []
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    t.*,
                    COALESCE(
                        array_agg(st.row_label || st.seat_number ORDER BY st.row_label, st.seat_number)
                            FILTER (WHERE st.id IS NOT NULL),
                        '{}'
                    ) AS seats
                FROM tickets t
                LEFT JOIN ticket_seats ts ON ts.ticket_id = t.id
                LEFT JOIN seats st ON st.id = ts.seat_id
                WHERE t.user_id = %s OR t.customer_email = %s
                GROUP BY t.id
                ORDER BY t.created_at DESC
                """,
                (user["id"], user["email"]),
            )
            return [ticket_row(row) for row in cur.fetchall()]


def set_movie_genres(cur, movie_id: int, genres: list[str]) -> None:
    cur.execute("DELETE FROM movie_genres WHERE movie_id = %s", (movie_id,))
    for genre in genres:
        cur.execute(
            """
            INSERT INTO genres (name)
            VALUES (%s)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
            """,
            (genre,),
        )
        genre_id = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO movie_genres (movie_id, genre_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (movie_id, genre_id),
        )


def create_seats_for_hall(cur, hall_id: int, rows_count: int, seats_per_row: int) -> None:
    cur.execute("DELETE FROM seats WHERE hall_id = %s", (hall_id,))
    for row_index in range(rows_count):
        row_label = chr(65 + row_index)
        for seat_number in range(1, seats_per_row + 1):
            cur.execute(
                "INSERT INTO seats (hall_id, row_label, seat_number) VALUES (%s, %s, %s)",
                (hall_id, row_label, seat_number),
            )


@app.get("/")
def health() -> dict:
    return {"status": "ok", "service": "TV Time API"}


@app.get("/api/bootstrap")
def bootstrap(user: Annotated[dict | None, Depends(optional_user)]) -> dict:
    return {
        "movies": list_movies(),
        "cinemas": list_cinemas(),
        "sessions": list_sessions(),
        "bookings": list_tickets(user),
        "user": user,
    }


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.*, r.code AS role_code
                FROM users u
                JOIN roles r ON r.id = u.role_id
                WHERE u.login = %s
                """,
                (payload.login,),
            )
            row = cur.fetchone()

    if not row or not verify_password(payload.password, row["password_hash"], row["login"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid login or password")

    return issue_tokens(row_to_user(row), response)


@app.post("/api/auth/register")
def register(payload: RegisterRequest, response: Response) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM roles WHERE code = 'client'")
            role_id = cur.fetchone()["id"]
            try:
                cur.execute(
                    """
                    INSERT INTO users (role_id, login, password_hash, full_name, email, phone)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, login, full_name, email, phone
                    """,
                    (
                        role_id,
                        payload.login,
                        hash_password(payload.password),
                        payload.name or payload.login,
                        payload.email,
                        payload.phone,
                    ),
                )
                row = cur.fetchone()
            except psycopg.errors.UniqueViolation as exc:
                raise HTTPException(status.HTTP_409_CONFLICT, "User already exists") from exc

    user = {**row, "role_code": "client"}
    return issue_tokens(row_to_user(user), response)


@app.post("/api/auth/refresh")
def refresh(
    payload: RefreshRequest | None = None,
    response: Response = None,
    refresh_token: Annotated[str | None, Cookie()] = None,
) -> dict:
    token = refresh_token
    if payload:
        token = token or payload.refreshToken or payload.refresh_token
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token is required")

    user_id = decode_token(token, "refresh")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    user = user_by_id(user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    return issue_tokens(user, response)


@app.post("/api/auth/logout")
def logout(response: Response) -> dict:
    response.delete_cookie("refresh_token")
    return {"ok": True}


@app.get("/api/movies")
def get_movies() -> list[dict]:
    return list_movies()


@app.post("/api/movies", dependencies=[Depends(admin_user)])
def create_movie(payload: MoviePayload) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO movies (title, director, studio, actors, age_rating, duration_minutes, description, poster_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    payload.title,
                    payload.director,
                    payload.studio,
                    payload.actors,
                    payload.ageRating,
                    payload.duration,
                    payload.description,
                    payload.posterUrl,
                ),
            )
            movie_id = cur.fetchone()["id"]
            set_movie_genres(cur, movie_id, payload.genres)
    return next(movie for movie in list_movies() if movie["id"] == movie_id)


@app.put("/api/movies/{movie_id}", dependencies=[Depends(admin_user)])
def update_movie(movie_id: int, payload: MoviePayload) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE movies
                SET title = %s, director = %s, studio = %s, actors = %s, age_rating = %s,
                    duration_minutes = %s, description = %s, poster_url = %s
                WHERE id = %s
                RETURNING id
                """,
                (
                    payload.title,
                    payload.director,
                    payload.studio,
                    payload.actors,
                    payload.ageRating,
                    payload.duration,
                    payload.description,
                    payload.posterUrl,
                    movie_id,
                ),
            )
            if not cur.fetchone():
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Movie not found")
            set_movie_genres(cur, movie_id, payload.genres)
    return next(movie for movie in list_movies() if movie["id"] == movie_id)


@app.delete("/api/movies/{movie_id}", dependencies=[Depends(admin_user)])
def delete_movie(movie_id: int) -> Response:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM movies WHERE id = %s", (movie_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/cinemas")
def get_cinemas() -> list[dict]:
    return list_cinemas()


@app.post("/api/cinemas", dependencies=[Depends(admin_user)])
def create_cinema(payload: CinemaPayload) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cinemas (name, address, district, phone)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (payload.name, payload.address, payload.district, payload.phone),
            )
            cinema_id = cur.fetchone()["id"]
            for hall in payload.halls:
                cur.execute(
                    """
                    INSERT INTO halls (cinema_id, name, rows_count, seats_per_row)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (cinema_id, hall.name, hall.rows, hall.seatsPerRow),
                )
                create_seats_for_hall(cur, cur.fetchone()["id"], hall.rows, hall.seatsPerRow)
    return next(cinema for cinema in list_cinemas() if cinema["id"] == cinema_id)


@app.put("/api/cinemas/{cinema_id}", dependencies=[Depends(admin_user)])
def update_cinema(cinema_id: int, payload: CinemaPayload) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE cinemas
                SET name = %s, address = %s, district = %s, phone = %s
                WHERE id = %s
                RETURNING id
                """,
                (payload.name, payload.address, payload.district, payload.phone, cinema_id),
            )
            if not cur.fetchone():
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Cinema not found")

            for hall in payload.halls:
                cur.execute(
                    """
                    INSERT INTO halls (cinema_id, name, rows_count, seats_per_row)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (cinema_id, name)
                    DO UPDATE SET rows_count = EXCLUDED.rows_count, seats_per_row = EXCLUDED.seats_per_row
                    RETURNING id
                    """,
                    (cinema_id, hall.name, hall.rows, hall.seatsPerRow),
                )
                create_seats_for_hall(cur, cur.fetchone()["id"], hall.rows, hall.seatsPerRow)
    return next(cinema for cinema in list_cinemas() if cinema["id"] == cinema_id)


@app.delete("/api/cinemas/{cinema_id}", dependencies=[Depends(admin_user)])
def delete_cinema(cinema_id: int) -> Response:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM cinemas WHERE id = %s", (cinema_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/sessions")
def get_sessions() -> list[dict]:
    return list_sessions()


@app.post("/api/sessions", dependencies=[Depends(admin_user)])
def create_session(payload: SessionPayload) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sessions (movie_id, hall_id, starts_at, price)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (payload.movieId, payload.hallId, parse_dt(payload.startsAt), payload.price),
            )
            session_id = cur.fetchone()["id"]
    return next(session for session in list_sessions() if session["id"] == session_id)


@app.put("/api/sessions/{session_id}", dependencies=[Depends(admin_user)])
def update_session(session_id: int, payload: SessionPayload) -> dict:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE sessions
                SET movie_id = %s, hall_id = %s, starts_at = %s, price = %s
                WHERE id = %s
                RETURNING id
                """,
                (payload.movieId, payload.hallId, parse_dt(payload.startsAt), payload.price, session_id),
            )
            if not cur.fetchone():
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return next(session for session in list_sessions() if session["id"] == session_id)


@app.delete("/api/sessions/{session_id}", dependencies=[Depends(admin_user)])
def delete_session(session_id: int) -> Response:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sessions WHERE id = %s", (session_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/tickets/my")
def get_my_tickets(user: Annotated[dict, Depends(current_user)]) -> list[dict]:
    return list_tickets(user)


@app.post("/api/tickets")
def create_ticket(
    payload: TicketPayload,
    user: Annotated[dict | None, Depends(optional_user)],
) -> dict:
    if not payload.seats:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "At least one seat is required")

    normalized_seats = [seat.strip().upper() for seat in payload.seats if seat.strip()]

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.id, s.price, s.hall_id
                FROM sessions s
                WHERE s.id = %s
                """,
                (payload.sessionId,),
            )
            session = cur.fetchone()
            if not session:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

            cur.execute(
                """
                SELECT id, row_label || seat_number AS label
                FROM seats
                WHERE hall_id = %s AND row_label || seat_number = ANY(%s)
                """,
                (session["hall_id"], normalized_seats),
            )
            seats = list(cur.fetchall())
            if len(seats) != len(set(normalized_seats)):
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Some seats are invalid")

            total = Decimal(session["price"]) * len(seats)
            cur.execute(
                """
                INSERT INTO tickets (session_id, user_id, customer_name, customer_email, status, total_price)
                VALUES (%s, %s, %s, %s, 'paid', %s)
                RETURNING id, session_id, customer_name, customer_email, total_price, created_at
                """,
                (
                    payload.sessionId,
                    user["id"] if user else None,
                    payload.customerName,
                    payload.customerEmail,
                    total,
                ),
            )
            ticket = cur.fetchone()

            try:
                for seat in seats:
                    cur.execute(
                        """
                        INSERT INTO ticket_seats (ticket_id, session_id, seat_id)
                        VALUES (%s, %s, %s)
                        """,
                        (ticket["id"], payload.sessionId, seat["id"]),
                    )
            except psycopg.errors.UniqueViolation as exc:
                raise HTTPException(status.HTTP_409_CONFLICT, "Seat already booked") from exc

            ticket["seats"] = sorted(seat["label"] for seat in seats)
            return ticket_row(ticket)
