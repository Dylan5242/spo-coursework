import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from './api/client.js';

const ROWS = 'ABCDEFGHJKLM'.split('');

const emptyMovie = {
  title: '',
  director: '',
  studio: '',
  actors: '',
  genres: '',
  ageRating: '12+',
  duration: 100,
  description: '',
  posterUrl: ''
};

const emptyCinema = {
  name: '',
  address: '',
  district: '',
  phone: '',
  halls: 'Зал 1;6;8'
};

const emptySession = {
  movieId: '',
  cinemaId: '',
  hallId: '',
  startsAt: '',
  price: 500,
  occupiedSeats: ''
};

function formatDate(value) {
  if (!value) {
    return 'Дата не указана';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMovie(movie) {
  return {
    id: movie.id,
    title: movie.title,
    director: movie.director,
    studio: movie.studio || '',
    actors: movie.actors || '',
    genres: toArray(movie.genres),
    ageRating: movie.ageRating ?? movie.age_rating ?? '12+',
    duration: movie.duration ?? movie.durationMinutes ?? movie.duration_minutes ?? 0,
    description: movie.description || '',
    posterUrl: movie.posterUrl ?? movie.poster_url ?? ''
  };
}

function normalizeCinema(cinema) {
  return {
    id: cinema.id,
    name: cinema.name,
    address: cinema.address,
    district: cinema.district || '',
    phone: cinema.phone || '',
    halls: (cinema.halls || []).map((hall) => ({
      id: hall.id,
      name: hall.name,
      rows: hall.rows ?? hall.rowsCount ?? hall.rows_count ?? 0,
      seatsPerRow: hall.seatsPerRow ?? hall.seats_per_row ?? 0
    }))
  };
}

function normalizeSession(session) {
  return {
    id: session.id,
    movieId: session.movieId ?? session.movie_id,
    cinemaId: session.cinemaId ?? session.cinema_id,
    hallId: session.hallId ?? session.hall_id,
    startsAt: session.startsAt ?? session.starts_at,
    price: Number(session.price || 0),
    occupiedSeats: session.occupiedSeats ?? session.occupied_seats ?? [],
    freeSeats: session.freeSeats ?? session.free_seats,
    totalSeats: session.totalSeats ?? session.total_seats
  };
}

function normalizeBooking(booking) {
  return {
    id: booking.id,
    sessionId: booking.sessionId ?? booking.session_id,
    seats: booking.seats || [],
    customerName: booking.customerName ?? booking.customer_name ?? '',
    customerEmail: booking.customerEmail ?? booking.customer_email ?? '',
    total: Number(booking.total ?? booking.totalPrice ?? booking.total_price ?? 0),
    createdAt: booking.createdAt ?? booking.created_at
  };
}

function App() {
  const [page, setPage] = useState('home');
  const [movies, setMovies] = useState([]);
  const [cinemas, setCinemas] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [user, setUser] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [status, setStatus] = useState({ loading: true, error: '' });
  const [notice, setNotice] = useState('');

  const [movieQuery, setMovieQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [directorFilter, setDirectorFilter] = useState('');
  const [cinemaQuery, setCinemaQuery] = useState('');
  const [movieSessionFilter, setMovieSessionFilter] = useState('all');
  const [cinemaSessionFilter, setCinemaSessionFilter] = useState('all');
  const [dateSessionFilter, setDateSessionFilter] = useState('');

  const [movieForm, setMovieForm] = useState(emptyMovie);
  const [cinemaForm, setCinemaForm] = useState(emptyCinema);
  const [sessionForm, setSessionForm] = useState(emptySession);
  const [editingMovieId, setEditingMovieId] = useState(null);
  const [editingCinemaId, setEditingCinemaId] = useState(null);
  const [editingSessionId, setEditingSessionId] = useState(null);

  const genres = useMemo(
    () => Array.from(new Set(movies.flatMap((movie) => movie.genres))).sort(),
    [movies]
  );

  const selectedSession = sessions.find((session) => session.id === Number(selectedSessionId));

  useEffect(() => {
    initializeAuthAndData();
  }, []);

  async function initializeAuthAndData() {
    await api.refresh();
    await loadBootstrap();
  }

  async function loadBootstrap() {
    setStatus({ loading: true, error: '' });

    try {
      const data = await api.getBootstrap();
      applyLoadedData(data);
      setStatus({ loading: false, error: '' });
    } catch (bootstrapError) {
      try {
        const [moviesData, cinemasData, sessionsData, bookingsData] = await Promise.all([
          api.getMovies(),
          api.getCinemas(),
          api.getSessions(),
          api.getBookings().catch(() => [])
        ]);

        applyLoadedData({
          movies: moviesData,
          cinemas: cinemasData,
          sessions: sessionsData,
          bookings: bookingsData
        });
        setStatus({ loading: false, error: '' });
      } catch (error) {
        setStatus({
          loading: false,
          error:
            'Backend API недоступен. Запустите сервер или задайте VITE_API_BASE_URL в frontend/.env.'
        });
      }
    }
  }

  function applyLoadedData(data) {
    const loadedMovies = (data.movies || []).map(normalizeMovie);
    const loadedCinemas = (data.cinemas || []).map(normalizeCinema);
    const loadedSessions = (data.sessions || []).map(normalizeSession);

    setMovies(loadedMovies);
    setCinemas(loadedCinemas);
    setSessions(loadedSessions);
    setBookings((data.bookings || data.tickets || []).map(normalizeBooking));
    if (data.user) {
      setUser(data.user);
    }
    setSelectedSessionId((current) => current || loadedSessions[0]?.id || null);
  }

  function go(target) {
    setPage(target);
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function movieById(id) {
    return movies.find((movie) => movie.id === Number(id));
  }

  function cinemaById(id) {
    return cinemas.find((cinema) => cinema.id === Number(id));
  }

  function hallById(cinemaId, hallId) {
    return cinemaById(cinemaId)?.halls.find((hall) => hall.id === Number(hallId));
  }

  function occupiedSeats(sessionId) {
    const session = sessions.find((item) => item.id === Number(sessionId));
    const sold = bookings
      .filter((booking) => booking.sessionId === Number(sessionId))
      .flatMap((booking) => booking.seats);

    return Array.from(new Set([...(session?.occupiedSeats || []), ...sold]));
  }

  function freeSeats(session) {
    if (typeof session.freeSeats === 'number') {
      return session.freeSeats - bookings
        .filter((booking) => booking.sessionId === Number(session.id))
        .flatMap((booking) => booking.seats).length;
    }

    const hall = hallById(session.cinemaId, session.hallId);
    return hall ? hall.rows * hall.seatsPerRow - occupiedSeats(session.id).length : 0;
  }

  function chooseSession(id) {
    setSelectedSessionId(id);
    setSelectedSeats([]);
    go('ticket');
  }

  async function refreshAfterChange(message) {
    await loadBootstrap();
    setNotice(message);
  }

  async function createBooking(payload) {
    const created = normalizeBooking(await api.createBooking(payload));
    setBookings((current) => [created, ...current]);
    setSelectedSeats([]);
    setNotice('Билет оформлен');
    go('profile');
  }

  if (status.loading) {
    return (
      <Shell page={page} go={go} user={user} setUser={setUser}>
        <div className="empty">Загрузка данных с backend...</div>
      </Shell>
    );
  }

  if (status.error) {
    return (
      <Shell page={page} go={go} user={user} setUser={setUser}>
        <PageTitle title="Нет подключения к backend" text={status.error} />
        <button type="button" className="primary-button" onClick={loadBootstrap}>
          Повторить загрузку
        </button>
      </Shell>
    );
  }

  return (
    <Shell page={page} go={go} user={user} setUser={setUser}>
      {notice && <div className="notice">{notice}</div>}
      {page === 'movies' && (
        <MoviesPage
          movies={movies}
          sessions={sessions}
          genres={genres}
          query={movieQuery}
          genre={genreFilter}
          director={directorFilter}
          setQuery={setMovieQuery}
          setGenre={setGenreFilter}
          setDirector={setDirectorFilter}
          openSessions={(movieId) => {
            setMovieSessionFilter(String(movieId));
            setCinemaSessionFilter('all');
            go('sessions');
          }}
        />
      )}
      {page === 'cinemas' && (
        <CinemasPage
          cinemas={cinemas}
          sessions={sessions}
          query={cinemaQuery}
          setQuery={setCinemaQuery}
          movieById={movieById}
          openSessions={(cinemaId) => {
            setCinemaSessionFilter(String(cinemaId));
            setMovieSessionFilter('all');
            go('sessions');
          }}
        />
      )}
      {page === 'sessions' && (
        <SessionsPage
          movies={movies}
          cinemas={cinemas}
          sessions={[...sessions].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))}
          movieFilter={movieSessionFilter}
          cinemaFilter={cinemaSessionFilter}
          dateFilter={dateSessionFilter}
          setMovieFilter={setMovieSessionFilter}
          setCinemaFilter={setCinemaSessionFilter}
          setDateFilter={setDateSessionFilter}
          movieById={movieById}
          cinemaById={cinemaById}
          hallById={hallById}
          freeSeats={freeSeats}
          chooseSession={chooseSession}
        />
      )}
      {page === 'ticket' && (
        <TicketPage
          session={selectedSession || sessions[0]}
          sessions={sessions}
          selectedSeats={selectedSeats}
          setSelectedSeats={setSelectedSeats}
          setSelectedSessionId={setSelectedSessionId}
          movieById={movieById}
          cinemaById={cinemaById}
          hallById={hallById}
          occupiedSeats={occupiedSeats}
          user={user}
          buyTicket={createBooking}
        />
      )}
      {page === 'profile' && (
        <ProfilePage
          bookings={bookings}
          sessions={sessions}
          user={user}
          movieById={movieById}
          cinemaById={cinemaById}
          chooseSession={chooseSession}
          go={go}
        />
      )}
      {page === 'auth' && <AuthPage setUser={setUser} go={go} />}
      {page === 'admin' && (
        <AdminPage
          user={user}
          movies={movies}
          cinemas={cinemas}
          sessions={sessions}
          forms={{ movieForm, cinemaForm, sessionForm }}
          setForms={{ setMovieForm, setCinemaForm, setSessionForm }}
          editing={{ editingMovieId, editingCinemaId, editingSessionId }}
          setEditing={{ setEditingMovieId, setEditingCinemaId, setEditingSessionId }}
          helpers={{ movieById, cinemaById }}
          refreshAfterChange={refreshAfterChange}
        />
      )}
      {page === 'home' && (
        <HomePage
          movies={movies}
          cinemas={cinemas}
          sessions={sessions}
          bookings={bookings}
          movieById={movieById}
          cinemaById={cinemaById}
          freeSeats={freeSeats}
          go={go}
          chooseSession={chooseSession}
        />
      )}
    </Shell>
  );
}

function Shell({ page, go, user, setUser, children }) {
  return (
    <div className="app">
      <Header page={page} go={go} user={user} setUser={setUser} />
      <main className="page">{children}</main>
    </div>
  );
}

function Header({ page, go, user, setUser }) {
  const tabs = [
    ['home', 'Главная'],
    ['movies', 'Фильмы'],
    ['cinemas', 'Кинотеатры'],
    ['sessions', 'Сеансы'],
    ['ticket', 'Билет'],
    ['profile', 'Мои билеты'],
    ['admin', 'Админка']
  ];

  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => go('home')}>
        <span className="brand-mark">TV</span>
        <span>
          <strong>TV Time</strong>
          <small>Справочная служба кинотеатров</small>
        </span>
      </button>
      <nav className="tabs">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" className={page === key ? 'active' : ''} onClick={() => go(key)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="user-area">
        {user ? (
          <>
            <span>{user.name || user.fullName || user.login}</span>
            <button
              type="button"
              className="ghost-button"
              onClick={async () => {
                await api.logout();
                setUser(null);
                go('home');
              }}
            >
              Выйти
            </button>
          </>
        ) : (
          <button type="button" className="primary-button" onClick={() => go('auth')}>
            Войти
          </button>
        )}
      </div>
    </header>
  );
}

function HomePage({ movies, cinemas, sessions, bookings, movieById, cinemaById, freeSeats, go, chooseSession }) {
  const soldSeats = bookings.reduce((sum, booking) => sum + booking.seats.length, 0);
  const nearest = [...sessions].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)).slice(0, 4);

  return (
    <section>
      <div className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Городская афиша</span>
          <h1>TV Time</h1>
          <p>Единый интерфейс для поиска фильмов, кинотеатров, сеансов, свободных мест и оформления билетов.</p>
          <div className="actions">
            <button type="button" className="primary-button" onClick={() => go('sessions')}>
              Найти сеанс
            </button>
            <button type="button" className="secondary-button" onClick={() => go('movies')}>
              Каталог фильмов
            </button>
          </div>
        </div>
        <div className="poster-strip">
          {movies.slice(0, 4).map((movie) => (
            <Poster key={movie.id} movie={movie} />
          ))}
        </div>
      </div>
      <div className="stats">
        <Stat label="Фильмы" value={movies.length} />
        <Stat label="Кинотеатры" value={cinemas.length} />
        <Stat label="Сеансы" value={sessions.length} />
        <Stat label="Продано мест" value={soldSeats} />
      </div>
      <SectionTitle title="Популярные фильмы" action="Все фильмы" onAction={() => go('movies')} />
      <div className="movie-grid">
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            sessionCount={sessions.filter((session) => session.movieId === movie.id).length}
            onOpen={() => {
              go('sessions');
            }}
          />
        ))}
      </div>
      <SectionTitle title="Ближайшие сеансы" action="Все сеансы" onAction={() => go('sessions')} />
      <div className="session-grid">
        {nearest.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            movie={movieById(session.movieId)}
            cinema={cinemaById(session.cinemaId)}
            freeSeats={freeSeats(session)}
            onChoose={() => chooseSession(session.id)}
          />
        ))}
      </div>
    </section>
  );
}

function MoviesPage({ movies, sessions, genres, query, genre, director, setQuery, setGenre, setDirector, openSessions }) {
  const filtered = movies.filter((movie) => {
    const q = lower(query);
    const d = lower(director);
    const searchOk = !q || lower(`${movie.title} ${movie.description} ${movie.genres.join(' ')}`).includes(q);
    const genreOk = genre === 'all' || movie.genres.includes(genre);
    const directorOk = !d || lower(movie.director).includes(d);
    return searchOk && genreOk && directorOk;
  });

  return (
    <section>
      <PageTitle title="Фильмы" text="Поиск по названию, жанру и режиссеру." />
      <div className="filter-bar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или описание" />
        <select value={genre} onChange={(event) => setGenre(event.target.value)}>
          <option value="all">Все жанры</option>
          {genres.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input value={director} onChange={(event) => setDirector(event.target.value)} placeholder="Режиссер" />
      </div>
      <div className="movie-grid">
        {filtered.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            sessionCount={sessions.filter((session) => session.movieId === movie.id).length}
            onOpen={() => openSessions(movie.id)}
          />
        ))}
      </div>
      {!filtered.length && <Empty text="Фильмы по выбранным условиям не найдены." />}
    </section>
  );
}

function CinemasPage({ cinemas, sessions, query, setQuery, movieById, openSessions }) {
  const filtered = cinemas.filter((cinema) => {
    const q = lower(query);
    return !q || lower(`${cinema.name} ${cinema.address} ${cinema.district}`).includes(q);
  });

  return (
    <section>
      <PageTitle title="Кинотеатры" text="Адреса, залы и текущий репертуар." />
      <div className="filter-bar one">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, адрес или район" />
      </div>
      <div className="cinema-list">
        {filtered.map((cinema) => {
          const movieIds = Array.from(new Set(sessions.filter((s) => s.cinemaId === cinema.id).map((s) => s.movieId)));
          const repertoire = movieIds.map(movieById).filter(Boolean);
          return (
            <article className="cinema-row" key={cinema.id}>
              <div>
                <span className="eyebrow">{cinema.district}</span>
                <h3>{cinema.name}</h3>
                <p>{cinema.address}</p>
                <p className="muted">{cinema.phone}</p>
              </div>
              <div className="chips">
                {cinema.halls.map((hall) => (
                  <span key={hall.id}>{hall.name}: {hall.rows * hall.seatsPerRow} мест</span>
                ))}
              </div>
              <div className="chips">
                {repertoire.length ? repertoire.map((movie) => <span key={movie.id}>{movie.title}</span>) : <span>Нет сеансов</span>}
              </div>
              <button type="button" className="primary-button" onClick={() => openSessions(cinema.id)}>
                Сеансы
              </button>
            </article>
          );
        })}
      </div>
      {!filtered.length && <Empty text="Кинотеатры по выбранным условиям не найдены." />}
    </section>
  );
}

function SessionsPage({
  movies,
  cinemas,
  sessions,
  movieFilter,
  cinemaFilter,
  dateFilter,
  setMovieFilter,
  setCinemaFilter,
  setDateFilter,
  movieById,
  cinemaById,
  hallById,
  freeSeats,
  chooseSession
}) {
  const filtered = sessions.filter((session) => {
    const movieOk = movieFilter === 'all' || session.movieId === Number(movieFilter);
    const cinemaOk = cinemaFilter === 'all' || session.cinemaId === Number(cinemaFilter);
    const dateOk = !dateFilter || session.startsAt?.slice(0, 10) === dateFilter;
    return movieOk && cinemaOk && dateOk;
  });

  return (
    <section>
      <PageTitle title="Сеансы" text="Расписание, цена и количество свободных мест." />
      <div className="filter-bar">
        <select value={movieFilter} onChange={(event) => setMovieFilter(event.target.value)}>
          <option value="all">Все фильмы</option>
          {movies.map((movie) => (
            <option key={movie.id} value={movie.id}>{movie.title}</option>
          ))}
        </select>
        <select value={cinemaFilter} onChange={(event) => setCinemaFilter(event.target.value)}>
          <option value="all">Все кинотеатры</option>
          {cinemas.map((cinema) => (
            <option key={cinema.id} value={cinema.id}>{cinema.name}</option>
          ))}
        </select>
        <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
      </div>
      <div className="session-grid">
        {filtered.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            movie={movieById(session.movieId)}
            cinema={cinemaById(session.cinemaId)}
            hall={hallById(session.cinemaId, session.hallId)}
            freeSeats={freeSeats(session)}
            onChoose={() => chooseSession(session.id)}
          />
        ))}
      </div>
      {!filtered.length && <Empty text="Сеансы по выбранным условиям не найдены." />}
    </section>
  );
}

function TicketPage({
  session,
  sessions,
  selectedSeats,
  setSelectedSeats,
  setSelectedSessionId,
  movieById,
  cinemaById,
  hallById,
  occupiedSeats,
  user,
  buyTicket
}) {
  const [customer, setCustomer] = useState(user?.name || user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');

  if (!session) {
    return <Empty text="Нет сеансов для оформления билета." />;
  }

  const movie = movieById(session.movieId);
  const cinema = cinemaById(session.cinemaId);
  const hall = hallById(session.cinemaId, session.hallId);
  const occupied = occupiedSeats(session.id);
  const total = selectedSeats.length * session.price;

  function toggleSeat(seat) {
    if (occupied.includes(seat)) {
      return;
    }
    setSelectedSeats(selectedSeats.includes(seat) ? selectedSeats.filter((item) => item !== seat) : [...selectedSeats, seat]);
  }

  function submit(event) {
    event.preventDefault();
    if (!selectedSeats.length || !customer.trim()) {
      return;
    }
    buyTicket({
      sessionId: session.id,
      seats: [...selectedSeats].sort(),
      customerName: customer.trim(),
      customerEmail: email.trim()
    });
  }

  return (
    <section>
      <PageTitle title="Билет" text={`${movie?.title || 'Фильм'} · ${cinema?.name || 'Кинотеатр'}`} />
      <div className="ticket-layout">
        <div className="seat-panel">
          <div className="screen">Экран</div>
          <div className="seat-map" style={{ gridTemplateColumns: `repeat(${hall?.seatsPerRow || 1}, 1fr)` }}>
            {ROWS.slice(0, hall?.rows || 0).flatMap((row) =>
              Array.from({ length: hall?.seatsPerRow || 0 }, (_, index) => {
                const seat = `${row}${index + 1}`;
                const isOccupied = occupied.includes(seat);
                const isSelected = selectedSeats.includes(seat);
                return (
                  <button
                    key={seat}
                    type="button"
                    className={`seat ${isOccupied ? 'occupied' : ''} ${isSelected ? 'selected' : ''}`}
                    disabled={isOccupied}
                    onClick={() => toggleSeat(seat)}
                  >
                    {seat}
                  </button>
                );
              })
            )}
          </div>
          <div className="legend">
            <span><i className="free" /> Свободно</span>
            <span><i className="selected" /> Выбрано</span>
            <span><i className="occupied" /> Занято</span>
          </div>
        </div>
        <form className="booking-form" onSubmit={submit}>
          <h3>{movie?.title}</h3>
          <p>{formatDate(session.startsAt)}</p>
          <p>{cinema?.name}, {hall?.name}</p>
          <label>
            Покупатель
            <input value={customer} onChange={(event) => setCustomer(event.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <div className="summary-line">
            <span>Места</span>
            <strong>{selectedSeats.length ? selectedSeats.join(', ') : 'не выбраны'}</strong>
          </div>
          <div className="summary-line">
            <span>Итого</span>
            <strong>{total} ₽</strong>
          </div>
          <button type="submit" className="primary-button full" disabled={!selectedSeats.length}>
            Купить билет
          </button>
          <select
            value={session.id}
            onChange={(event) => {
              setSelectedSessionId(Number(event.target.value));
              setSelectedSeats([]);
            }}
          >
            {sessions.map((item) => (
              <option key={item.id} value={item.id}>
                {movieById(item.movieId)?.title} · {formatDate(item.startsAt)}
              </option>
            ))}
          </select>
        </form>
      </div>
    </section>
  );
}

function ProfilePage({ bookings, sessions, user, movieById, cinemaById, chooseSession, go }) {
  if (!user) {
    return (
      <section>
        <PageTitle title="Мои билеты" text="Войдите или оформите билет, чтобы увидеть заказы." />
        <button type="button" className="primary-button" onClick={() => go('auth')}>Войти</button>
      </section>
    );
  }

  return (
    <section>
      <PageTitle title="Мои билеты" text={user.name || user.fullName || user.login} />
      <div className="ticket-list">
        {bookings.map((booking) => {
          const session = sessions.find((item) => item.id === booking.sessionId);
          const movie = session && movieById(session.movieId);
          const cinema = session && cinemaById(session.cinemaId);
          return (
            <article className="ticket-item" key={booking.id}>
              <div>
                <span className="eyebrow">Заказ #{booking.id}</span>
                <h3>{movie?.title || 'Сеанс удален'}</h3>
                <p>{cinema?.name || 'Кинотеатр удален'} · {session ? formatDate(session.startsAt) : 'нет даты'}</p>
              </div>
              <div className="ticket-price">
                <strong>{booking.seats.join(', ')}</strong>
                <span>{booking.total} ₽</span>
              </div>
              {session && <button type="button" className="secondary-button" onClick={() => chooseSession(session.id)}>Еще билет</button>}
            </article>
          );
        })}
      </div>
      {!bookings.length && <Empty text="Купленных билетов пока нет." />}
    </section>
  );
}

function AuthPage({ setUser, go }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ login: '', password: '', name: '', email: '', phone: '' });
  const [error, setError] = useState('');

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      const data =
        mode === 'login'
          ? await api.login({ login: form.login, password: form.password })
          : await api.register(form);
      const authUser = data.user || data.profile || data.account || null;
      setUser(authUser);
      go(authUser?.role === 'admin' ? 'admin' : 'profile');
    } catch (requestError) {
      setError('Backend отклонил авторизацию или регистрацию.');
    }
  }

  return (
    <section className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <PageTitle title={mode === 'login' ? 'Вход' : 'Регистрация'} text="Данные отправляются на backend API." />
        {error && <div className="empty">{error}</div>}
        {mode === 'register' && (
          <>
            <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Имя" />
            <input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="Почта" />
            <input value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="Телефон" />
          </>
        )}
        <input value={form.login} onChange={(event) => update('login', event.target.value)} placeholder="Логин" />
        <input type="password" value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="Пароль" />
        <button type="submit" className="primary-button full">{mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</button>
        <button type="button" className="text-button center" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Создать аккаунт' : 'Уже есть аккаунт'}
        </button>
      </form>
    </section>
  );
}

function AdminPage({
  user,
  movies,
  cinemas,
  sessions,
  forms,
  setForms,
  editing,
  setEditing,
  helpers,
  refreshAfterChange
}) {
  const { movieForm, cinemaForm, sessionForm } = forms;
  const { setMovieForm, setCinemaForm, setSessionForm } = setForms;
  const { editingMovieId, editingCinemaId, editingSessionId } = editing;
  const { setEditingMovieId, setEditingCinemaId, setEditingSessionId } = setEditing;
  const [tab, setTab] = useState('movies');

  if (user?.role !== 'admin') {
    return (
      <section>
        <PageTitle title="Админка" text="Управление доступно только администратору." />
        <Empty text="Войдите под учетной записью администратора." />
      </section>
    );
  }

  function parseHalls(text) {
    return text.split('\n').map((line) => {
      const [name, rows, seatsPerRow] = line.split(';').map((part) => part.trim());
      return {
        name,
        rows: Number(rows) || 5,
        seatsPerRow: Number(seatsPerRow) || 8
      };
    });
  }

  async function saveMovie(event) {
    event.preventDefault();
    const payload = {
      ...movieForm,
      genres: toArray(movieForm.genres),
      duration: Number(movieForm.duration)
    };
    if (editingMovieId) {
      await api.updateMovie(editingMovieId, payload);
    } else {
      await api.createMovie(payload);
    }
    setMovieForm(emptyMovie);
    setEditingMovieId(null);
    await refreshAfterChange('Фильм сохранен');
  }

  async function saveCinema(event) {
    event.preventDefault();
    const payload = {
      ...cinemaForm,
      halls: parseHalls(cinemaForm.halls)
    };
    if (editingCinemaId) {
      await api.updateCinema(editingCinemaId, payload);
    } else {
      await api.createCinema(payload);
    }
    setCinemaForm(emptyCinema);
    setEditingCinemaId(null);
    await refreshAfterChange('Кинотеатр сохранен');
  }

  async function saveSession(event) {
    event.preventDefault();
    const payload = {
      ...sessionForm,
      movieId: Number(sessionForm.movieId),
      cinemaId: Number(sessionForm.cinemaId),
      hallId: Number(sessionForm.hallId),
      price: Number(sessionForm.price),
      occupiedSeats: toArray(sessionForm.occupiedSeats).map((seat) => seat.toUpperCase())
    };
    if (editingSessionId) {
      await api.updateSession(editingSessionId, payload);
    } else {
      await api.createSession(payload);
    }
    setSessionForm(emptySession);
    setEditingSessionId(null);
    await refreshAfterChange('Сеанс сохранен');
  }

  async function remove(type, id) {
    if (type === 'movie') await api.deleteMovie(id);
    if (type === 'cinema') await api.deleteCinema(id);
    if (type === 'session') await api.deleteSession(id);
    await refreshAfterChange('Запись удалена');
  }

  const currentCinema = cinemas.find((cinema) => cinema.id === Number(sessionForm.cinemaId));

  return (
    <section>
      <PageTitle title="Админка" text="CRUD-операции отправляются на backend API." />
      <div className="admin-tabs">
        <button type="button" className={tab === 'movies' ? 'active' : ''} onClick={() => setTab('movies')}>Фильмы</button>
        <button type="button" className={tab === 'cinemas' ? 'active' : ''} onClick={() => setTab('cinemas')}>Кинотеатры</button>
        <button type="button" className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>Сеансы</button>
      </div>

      {tab === 'movies' && (
        <div className="admin-layout">
          <form className="admin-form" onSubmit={saveMovie}>
            <h3>{editingMovieId ? 'Редактирование фильма' : 'Новый фильм'}</h3>
            <input placeholder="Название" value={movieForm.title} onChange={(e) => setMovieForm({ ...movieForm, title: e.target.value })} />
            <input placeholder="Режиссер" value={movieForm.director} onChange={(e) => setMovieForm({ ...movieForm, director: e.target.value })} />
            <input placeholder="Киностудия" value={movieForm.studio} onChange={(e) => setMovieForm({ ...movieForm, studio: e.target.value })} />
            <input placeholder="Актеры" value={movieForm.actors} onChange={(e) => setMovieForm({ ...movieForm, actors: e.target.value })} />
            <input placeholder="Жанры через запятую" value={movieForm.genres} onChange={(e) => setMovieForm({ ...movieForm, genres: e.target.value })} />
            <input placeholder="URL постера с backend" value={movieForm.posterUrl} onChange={(e) => setMovieForm({ ...movieForm, posterUrl: e.target.value })} />
            <div className="form-row">
              <select value={movieForm.ageRating} onChange={(e) => setMovieForm({ ...movieForm, ageRating: e.target.value })}>
                <option>0+</option><option>6+</option><option>12+</option><option>16+</option><option>18+</option>
              </select>
              <input type="number" min="1" value={movieForm.duration} onChange={(e) => setMovieForm({ ...movieForm, duration: e.target.value })} />
            </div>
            <textarea placeholder="Описание" value={movieForm.description} onChange={(e) => setMovieForm({ ...movieForm, description: e.target.value })} />
            <button type="submit" className="primary-button full">{editingMovieId ? 'Сохранить' : 'Добавить'}</button>
          </form>
          <AdminTable
            columns={['Название', 'Режиссер', 'Жанры']}
            rows={movies.map((movie) => ({
              id: movie.id,
              cells: [movie.title, movie.director, movie.genres.join(', ')],
              edit: () => {
                setMovieForm({ ...movie, genres: movie.genres.join(', ') });
                setEditingMovieId(movie.id);
              },
              remove: () => remove('movie', movie.id)
            }))}
          />
        </div>
      )}

      {tab === 'cinemas' && (
        <div className="admin-layout">
          <form className="admin-form" onSubmit={saveCinema}>
            <h3>{editingCinemaId ? 'Редактирование кинотеатра' : 'Новый кинотеатр'}</h3>
            <input placeholder="Название" value={cinemaForm.name} onChange={(e) => setCinemaForm({ ...cinemaForm, name: e.target.value })} />
            <input placeholder="Адрес" value={cinemaForm.address} onChange={(e) => setCinemaForm({ ...cinemaForm, address: e.target.value })} />
            <input placeholder="Район" value={cinemaForm.district} onChange={(e) => setCinemaForm({ ...cinemaForm, district: e.target.value })} />
            <input placeholder="Телефон" value={cinemaForm.phone} onChange={(e) => setCinemaForm({ ...cinemaForm, phone: e.target.value })} />
            <textarea placeholder="Зал 1;6;8" value={cinemaForm.halls} onChange={(e) => setCinemaForm({ ...cinemaForm, halls: e.target.value })} />
            <button type="submit" className="primary-button full">{editingCinemaId ? 'Сохранить' : 'Добавить'}</button>
          </form>
          <AdminTable
            columns={['Название', 'Адрес', 'Залы']}
            rows={cinemas.map((cinema) => ({
              id: cinema.id,
              cells: [cinema.name, cinema.address, cinema.halls.map((hall) => `${hall.name}: ${hall.rows * hall.seatsPerRow}`).join(', ')],
              edit: () => {
                setCinemaForm({ ...cinema, halls: cinema.halls.map((hall) => `${hall.name};${hall.rows};${hall.seatsPerRow}`).join('\n') });
                setEditingCinemaId(cinema.id);
              },
              remove: () => remove('cinema', cinema.id)
            }))}
          />
        </div>
      )}

      {tab === 'sessions' && (
        <div className="admin-layout">
          <form className="admin-form" onSubmit={saveSession}>
            <h3>{editingSessionId ? 'Редактирование сеанса' : 'Новый сеанс'}</h3>
            <select value={sessionForm.movieId} onChange={(e) => setSessionForm({ ...sessionForm, movieId: e.target.value })}>
              <option value="">Фильм</option>
              {movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title}</option>)}
            </select>
            <select value={sessionForm.cinemaId} onChange={(e) => setSessionForm({ ...sessionForm, cinemaId: e.target.value, hallId: '' })}>
              <option value="">Кинотеатр</option>
              {cinemas.map((cinema) => <option key={cinema.id} value={cinema.id}>{cinema.name}</option>)}
            </select>
            <select value={sessionForm.hallId} onChange={(e) => setSessionForm({ ...sessionForm, hallId: e.target.value })}>
              <option value="">Зал</option>
              {currentCinema?.halls.map((hall) => <option key={hall.id} value={hall.id}>{hall.name}</option>)}
            </select>
            <input type="datetime-local" value={sessionForm.startsAt} onChange={(e) => setSessionForm({ ...sessionForm, startsAt: e.target.value })} />
            <input type="number" min="1" value={sessionForm.price} onChange={(e) => setSessionForm({ ...sessionForm, price: e.target.value })} />
            <input placeholder="Занятые места: A1, B2" value={sessionForm.occupiedSeats} onChange={(e) => setSessionForm({ ...sessionForm, occupiedSeats: e.target.value })} />
            <button type="submit" className="primary-button full">{editingSessionId ? 'Сохранить' : 'Добавить'}</button>
          </form>
          <AdminTable
            columns={['Фильм', 'Кинотеатр', 'Дата']}
            rows={sessions.map((session) => ({
              id: session.id,
              cells: [helpers.movieById(session.movieId)?.title || 'Фильм удален', helpers.cinemaById(session.cinemaId)?.name || 'Кинотеатр удален', formatDate(session.startsAt)],
              edit: () => {
                setSessionForm({
                  movieId: String(session.movieId),
                  cinemaId: String(session.cinemaId),
                  hallId: String(session.hallId),
                  startsAt: session.startsAt,
                  price: session.price,
                  occupiedSeats: session.occupiedSeats.join(', ')
                });
                setEditingSessionId(session.id);
              },
              remove: () => remove('session', session.id)
            }))}
          />
        </div>
      )}
    </section>
  );
}

function Poster({ movie }) {
  if (movie.posterUrl) {
    return <img src={assetUrl(movie.posterUrl)} alt={movie.title} />;
  }

  return <div className="poster-fallback">{movie.title?.slice(0, 2) || 'TV'}</div>;
}

function MovieCard({ movie, sessionCount, onOpen }) {
  return (
    <article className="movie-card">
      <div className="poster">
        <Poster movie={movie} />
        <span className="age">{movie.ageRating}</span>
      </div>
      <div className="movie-body">
        <h3>{movie.title}</h3>
        <p>{movie.description}</p>
        <div className="chips">{movie.genres.map((genre) => <span key={genre}>{genre}</span>)}</div>
        <div className="meta"><span>{movie.director}</span><span>{movie.duration} мин.</span></div>
        <button type="button" className="primary-button full" onClick={onOpen}>Сеансы: {sessionCount}</button>
      </div>
    </article>
  );
}

function SessionCard({ session, movie, cinema, hall, freeSeats, onChoose }) {
  const capacity = session.totalSeats || (hall ? hall.rows * hall.seatsPerRow : 0);
  return (
    <article className="session-card">
      <div className="session-head">
        <strong>{formatDate(session.startsAt)}</strong>
        <span>{session.price} ₽</span>
      </div>
      <h3>{movie?.title || 'Фильм удален'}</h3>
      <p>{cinema?.name || 'Кинотеатр удален'}</p>
      <p className="muted">{hall?.name || 'Зал удален'} · свободно {freeSeats} из {capacity}</p>
      <div className="availability"><span style={{ width: `${capacity ? (freeSeats / capacity) * 100 : 0}%` }} /></div>
      <button type="button" className="primary-button full" disabled={freeSeats <= 0} onClick={onChoose}>Выбрать места</button>
    </article>
  );
}

function AdminTable({ columns, rows }) {
  return (
    <div className="admin-table">
      <div className="admin-head">{columns.map((column) => <span key={column}>{column}</span>)}<span>Действия</span></div>
      {rows.map((row) => (
        <div className="admin-row" key={row.id}>
          {row.cells.map((cell, index) => <span key={`${row.id}-${index}`}>{cell}</span>)}
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={row.edit}>Изменить</button>
            <button type="button" className="danger-button" onClick={row.remove}>Удалить</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>;
}

function SectionTitle({ title, action, onAction }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      <button type="button" className="text-button" onClick={onAction}>{action}</button>
    </div>
  );
}

function PageTitle({ title, text }) {
  return <div className="page-title"><h1>{title}</h1>{text && <p>{text}</p>}</div>;
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

export default App;
