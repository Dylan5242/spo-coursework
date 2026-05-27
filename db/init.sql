-- PostgreSQL initialization script for the TV Time cinema reference service.
-- Run example:
--   psql -U postgres -d tv_time -f db/init.sql

DROP SCHEMA IF EXISTS tv_time CASCADE;
CREATE SCHEMA tv_time;
SET search_path = tv_time;

CREATE TABLE roles (
    id SMALLSERIAL PRIMARY KEY,
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL
);

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    role_id SMALLINT NOT NULL REFERENCES roles(id),
    login VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(160) NOT NULL,
    email VARCHAR(160) UNIQUE,
    phone VARCHAR(40),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE cinemas (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    address VARCHAR(255) NOT NULL,
    district VARCHAR(120),
    phone VARCHAR(40),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE halls (
    id BIGSERIAL PRIMARY KEY,
    cinema_id BIGINT NOT NULL REFERENCES cinemas(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    rows_count INTEGER NOT NULL CHECK (rows_count > 0),
    seats_per_row INTEGER NOT NULL CHECK (seats_per_row > 0),
    UNIQUE (cinema_id, name)
);

CREATE TABLE seats (
    id BIGSERIAL PRIMARY KEY,
    hall_id BIGINT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
    row_label VARCHAR(4) NOT NULL,
    seat_number INTEGER NOT NULL CHECK (seat_number > 0),
    UNIQUE (hall_id, row_label, seat_number)
);

CREATE TABLE movies (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    director VARCHAR(160) NOT NULL,
    studio VARCHAR(160),
    actors TEXT,
    age_rating VARCHAR(8) NOT NULL CHECK (age_rating IN ('0+', '6+', '12+', '16+', '18+')),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    description TEXT,
    poster_url VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE genres (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE movie_genres (
    movie_id BIGINT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    genre_id BIGINT NOT NULL REFERENCES genres(id) ON DELETE RESTRICT,
    PRIMARY KEY (movie_id, genre_id)
);

CREATE TABLE sessions (
    id BIGSERIAL PRIMARY KEY,
    movie_id BIGINT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    hall_id BIGINT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
    starts_at TIMESTAMP NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (hall_id, starts_at)
);

CREATE TABLE tickets (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(160) NOT NULL,
    customer_email VARCHAR(160),
    status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (status IN ('reserved', 'paid', 'cancelled')),
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE ticket_seats (
    ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    seat_id BIGINT NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
    PRIMARY KEY (ticket_id, seat_id),
    UNIQUE (session_id, seat_id)
);

CREATE INDEX idx_movies_title ON movies USING gin (to_tsvector('russian', title));
CREATE INDEX idx_movies_director ON movies (director);
CREATE INDEX idx_cinemas_name ON cinemas (name);
CREATE INDEX idx_sessions_movie ON sessions (movie_id);
CREATE INDEX idx_sessions_starts_at ON sessions (starts_at);
CREATE INDEX idx_tickets_session ON tickets (session_id);

INSERT INTO roles (id, code, name) VALUES
    (1, 'admin', 'Администратор'),
    (2, 'client', 'Клиент');

INSERT INTO users (id, role_id, login, password_hash, full_name, email, phone) VALUES
    (1, 1, 'admin', 'demo-password-hash', 'Администратор', 'admin@tvtime.local', '+7 (495) 000-00-01'),
    (2, 2, 'client', 'demo-password-hash', 'Демо пользователь', 'client@tvtime.local', '+7 (495) 000-00-02');

INSERT INTO cinemas (id, name, address, district, phone) VALUES
    (1, 'КиноМакс', 'ул. Пушкина, д. 10, ТЦ "Центральный"', 'Центр', '+7 (495) 100-20-30'),
    (2, 'Синема Парк', 'пр. Ленина, д. 45, ТРК "Горизонт"', 'Северный', '+7 (495) 200-45-45'),
    (3, 'Формула Кино', 'Набережная, д. 2, Сити-Молл', 'Южный', '+7 (495) 300-80-90'),
    (4, 'Победа', 'ул. Советская, д. 1, историческое здание', 'Старый город', '+7 (495) 400-11-11');

INSERT INTO halls (id, cinema_id, name, rows_count, seats_per_row) VALUES
    (1, 1, 'Зал 1', 6, 8),
    (2, 1, 'Зал 2', 5, 7),
    (3, 2, 'IMAX', 7, 9),
    (4, 2, 'Комфорт', 5, 8),
    (5, 3, 'Премиум', 6, 7),
    (6, 3, 'Зал 2', 4, 8),
    (7, 4, 'Большой зал', 6, 9);

INSERT INTO seats (hall_id, row_label, seat_number)
SELECT
    h.id,
    chr(64 + row_index),
    seat_number
FROM halls h
CROSS JOIN LATERAL generate_series(1, h.rows_count) AS row_index
CROSS JOIN LATERAL generate_series(1, h.seats_per_row) AS seat_number;

INSERT INTO movies (id, title, director, studio, actors, age_rating, duration_minutes, description, poster_url) VALUES
    (1, 'Бойцовский клуб', 'Дэвид Финчер', '20th Century Fox', 'Эдвард Нортон, Брэд Питт, Хелена Бонем Картер', '18+', 139, 'История офисного работника, который попадает в закрытый клуб.', '/static/posters/fight_club.webp'),
    (2, 'Драйв', 'Николас Виндинг Рефн', 'FilmDistrict', 'Райан Гослинг, Кэри Маллиган, Брайан Крэнстон', '18+', 100, 'Водитель-каскадер помогает преступникам ночью.', '/static/posters/drive.jpg'),
    (3, 'Бегущий по лезвию 2049', 'Дени Вильнев', 'Warner Bros.', 'Райан Гослинг, Харрисон Форд, Ана де Армас', '18+', 164, 'Офицер Кей раскрывает тайну будущего.', '/static/posters/Blade Runner 2049.jpg'),
    (4, 'Американский психопат', 'Мэри Хэррон', 'Lionsgate', 'Кристиан Бэйл, Джаред Лето, Уиллем Дефо', '18+', 102, 'Успешный финансист скрывает опасную одержимость.', '/static/posters/American Psycho.webp'),
    (5, 'Майнкрафт фильм', 'Джаред Хесс', 'Warner Bros.', 'Джейсон Момоа, Джек Блэк, Эмма Майерс', '12+', 101, 'Группа героев попадает в кубический мир.', '/static/posters/minecraft movie.jpg');

INSERT INTO genres (id, name) VALUES
    (1, 'Триллер'),
    (2, 'Драма'),
    (3, 'Нео-нуар'),
    (4, 'Боевик'),
    (5, 'Фантастика'),
    (6, 'Приключения'),
    (7, 'Фэнтези');

INSERT INTO movie_genres (movie_id, genre_id) VALUES
    (1, 1), (1, 2),
    (2, 3), (2, 4),
    (3, 5), (3, 2),
    (4, 2), (4, 1),
    (5, 6), (5, 7);

INSERT INTO sessions (id, movie_id, hall_id, starts_at, price) VALUES
    (1, 1, 1, '2026-05-28 19:30:00', 520.00),
    (2, 2, 3, '2026-05-28 21:10:00', 690.00),
    (3, 3, 4, '2026-05-29 18:20:00', 610.00),
    (4, 4, 5, '2026-05-29 22:00:00', 560.00),
    (5, 5, 7, '2026-05-30 15:00:00', 430.00),
    (6, 3, 2, '2026-05-30 20:40:00', 540.00);

INSERT INTO tickets (id, session_id, user_id, customer_name, customer_email, status, total_price) VALUES
    (1, 1, 2, 'Демо пользователь', 'client@tvtime.local', 'paid', 1040.00),
    (2, 2, NULL, 'Иван Иванов', 'ivan@example.com', 'paid', 1380.00),
    (3, 3, NULL, 'Мария Петрова', 'maria@example.com', 'reserved', 610.00);

INSERT INTO ticket_seats (ticket_id, session_id, seat_id)
SELECT 1, 1, s.id FROM seats s WHERE s.hall_id = 1 AND (s.row_label, s.seat_number) IN (('A', 1), ('A', 2));

INSERT INTO ticket_seats (ticket_id, session_id, seat_id)
SELECT 2, 2, s.id FROM seats s WHERE s.hall_id = 3 AND (s.row_label, s.seat_number) IN (('A', 5), ('A', 6));

INSERT INTO ticket_seats (ticket_id, session_id, seat_id)
SELECT 3, 3, s.id FROM seats s WHERE s.hall_id = 4 AND (s.row_label, s.seat_number) IN (('B', 2));

CREATE VIEW v_session_availability AS
SELECT
    se.id AS session_id,
    m.title AS movie_title,
    c.name AS cinema_name,
    h.name AS hall_name,
    se.starts_at,
    se.price,
    count(st.id) AS total_seats,
    count(ts.seat_id) FILTER (WHERE t.status <> 'cancelled') AS occupied_seats,
    count(st.id) - count(ts.seat_id) FILTER (WHERE t.status <> 'cancelled') AS free_seats
FROM sessions se
JOIN movies m ON m.id = se.movie_id
JOIN halls h ON h.id = se.hall_id
JOIN cinemas c ON c.id = h.cinema_id
JOIN seats st ON st.hall_id = h.id
LEFT JOIN ticket_seats ts ON ts.session_id = se.id AND ts.seat_id = st.id
LEFT JOIN tickets t ON t.id = ts.ticket_id
GROUP BY se.id, m.title, c.name, h.name, se.starts_at, se.price;

CREATE VIEW v_cinema_repertoire AS
SELECT DISTINCT
    c.id AS cinema_id,
    c.name AS cinema_name,
    m.id AS movie_id,
    m.title AS movie_title,
    m.director,
    string_agg(DISTINCT g.name, ', ' ORDER BY g.name) AS genres
FROM cinemas c
JOIN halls h ON h.cinema_id = c.id
JOIN sessions se ON se.hall_id = h.id
JOIN movies m ON m.id = se.movie_id
JOIN movie_genres mg ON mg.movie_id = m.id
JOIN genres g ON g.id = mg.genre_id
GROUP BY c.id, c.name, m.id, m.title, m.director;

SELECT setval(pg_get_serial_sequence('roles', 'id'), (SELECT max(id) FROM roles));
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT max(id) FROM users));
SELECT setval(pg_get_serial_sequence('cinemas', 'id'), (SELECT max(id) FROM cinemas));
SELECT setval(pg_get_serial_sequence('halls', 'id'), (SELECT max(id) FROM halls));
SELECT setval(pg_get_serial_sequence('movies', 'id'), (SELECT max(id) FROM movies));
SELECT setval(pg_get_serial_sequence('genres', 'id'), (SELECT max(id) FROM genres));
SELECT setval(pg_get_serial_sequence('sessions', 'id'), (SELECT max(id) FROM sessions));
SELECT setval(pg_get_serial_sequence('tickets', 'id'), (SELECT max(id) FROM tickets));
