# Steakz Backend

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Server starts on port 4000. Port is automatically cleared before each start.

## Environment Variables

Copy `.env.example` to `.env` and fill in your database credentials:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret key for JWT tokens
- `PORT` — Server port (default: 4000)

## Database

```bash
npx prisma db push       # sync schema
npx prisma db seed       # seed with Spanish branches and staff
npx prisma studio        # browse data in browser
```
