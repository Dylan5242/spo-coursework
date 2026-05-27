from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    login: str
    password: str


class RegisterRequest(BaseModel):
    login: str
    password: str
    name: str | None = None
    email: str | None = None
    phone: str | None = None


class RefreshRequest(BaseModel):
    refreshToken: str | None = None
    refresh_token: str | None = None


class MoviePayload(BaseModel):
    title: str
    director: str
    studio: str | None = None
    actors: str | None = None
    genres: list[str] = Field(default_factory=list)
    ageRating: str = "12+"
    duration: int = 100
    description: str | None = None
    posterUrl: str | None = None


class HallPayload(BaseModel):
    name: str
    rows: int = 5
    seatsPerRow: int = 8


class CinemaPayload(BaseModel):
    name: str
    address: str
    district: str | None = None
    phone: str | None = None
    halls: list[HallPayload] = Field(default_factory=list)


class SessionPayload(BaseModel):
    movieId: int
    cinemaId: int
    hallId: int
    startsAt: str
    price: float
    occupiedSeats: list[str] = Field(default_factory=list)


class TicketPayload(BaseModel):
    sessionId: int
    seats: list[str]
    customerName: str
    customerEmail: str | None = None
