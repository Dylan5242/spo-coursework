const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const API_PREFIX = '/api';
const ACCESS_TOKEN_KEY = 'tvtime.accessToken';
const REFRESH_TOKEN_KEY = 'tvtime.refreshToken';

let accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY) || '';
let refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY) || '';

export function setTokens(tokens = {}) {
  accessToken = tokens.accessToken || tokens.access_token || '';
  refreshToken = tokens.refreshToken || tokens.refresh_token || '';

  if (accessToken) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function clearTokens() {
  setTokens({ accessToken: '', refreshToken: '' });
}

function buildUrl(path, params = {}) {
  const url = new URL(`${API_PREFIX}${path}`, API_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

async function request(path, options = {}) {
  const { params, skipAuth = false, skipRefresh = false, ...requestOptions } = options;
  const headers = {
    'Content-Type': 'application/json',
    ...(requestOptions.headers || {})
  };

  if (!skipAuth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(buildUrl(path, params), {
    credentials: 'include',
    headers,
    ...requestOptions
  });

  if (response.status === 401 && !skipAuth && !skipRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, { params, skipAuth, skipRefresh: true, ...requestOptions });
    }
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function refreshAccessToken() {
  try {
    const body = refreshToken ? JSON.stringify({ refreshToken }) : undefined;
    const response = await fetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body
    });

    if (!response.ok) {
      clearTokens();
      return false;
    }

    const data = await response.json();
    setTokens(data);
    return Boolean(accessToken);
  } catch {
    clearTokens();
    return false;
  }
}

export function assetUrl(path) {
  if (!path) {
    return '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return new URL(path, API_BASE_URL).toString();
}

export const api = {
  getBootstrap: () => request('/bootstrap'),
  getMovies: (params) => request('/movies', { params }),
  createMovie: (payload) => request('/movies', { method: 'POST', body: JSON.stringify(payload) }),
  updateMovie: (id, payload) =>
    request(`/movies/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteMovie: (id) => request(`/movies/${id}`, { method: 'DELETE' }),

  getCinemas: (params) => request('/cinemas', { params }),
  createCinema: (payload) => request('/cinemas', { method: 'POST', body: JSON.stringify(payload) }),
  updateCinema: (id, payload) =>
    request(`/cinemas/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCinema: (id) => request(`/cinemas/${id}`, { method: 'DELETE' }),

  getSessions: (params) => request('/sessions', { params }),
  createSession: (payload) => request('/sessions', { method: 'POST', body: JSON.stringify(payload) }),
  updateSession: (id, payload) =>
    request(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteSession: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),

  getBookings: () => request('/tickets/my'),
  createBooking: (payload) => request('/tickets', { method: 'POST', body: JSON.stringify(payload) }),

  login: async (payload) => {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true
    });
    setTokens(data);
    return data;
  },
  register: async (payload) => {
    const data = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true
    });
    setTokens(data);
    return data;
  },
  refresh: refreshAccessToken,
  logout: async () => {
    try {
      await request('/auth/logout', { method: 'POST', skipRefresh: true });
    } finally {
      clearTokens();
    }
  }
};
