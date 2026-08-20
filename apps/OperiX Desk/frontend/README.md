# OperiX Desk

A desk and meeting-room reservation application built with **FastAPI**,
**PostgreSQL**, and **Vite + React**. OperiX Desk uses the shared OperiX
Supabase Auth account and organization context.

## Prerequisites

Before running the project, make sure you have installed:

* Python 3.12+ (or the version used by the team)
* Node.js and npm
* Docker with the local Supabase stack running

---

## Database Setup

1. Apply the root OperiX Supabase migrations, including the Desk legacy schema
   and shared-workspace migration.
2. Configure your backend `.env` file:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_INTERNAL_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SHARED_AUTH_ENABLED=true
LEGACY_AUTH_ENABLED=false
```

---

## Backend Setup

Navigate to the backend folder:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate the virtual environment:

### Windows

```bash
venv\Scripts\activate
```

### Linux / macOS

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server:

```bash
uvicorn app.main:app --reload
```

Backend will run at:

```text
http://localhost:8000
```

API documentation:

```text
http://localhost:8000/docs
```

---

## Frontend Setup

Navigate to the frontend folder:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Frontend will run at:

```text
http://localhost:3000
```

---

## Project Structure

```text
OperiX Desk/
│
├── backend/
│   ├── app/
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── package-lock.json
│
└── README.md
```

---

## Team Workflow

1. Pull the latest changes:

```bash
git pull
```

2. Create a new branch:

```bash
git checkout -b feature/your-feature-name
```

3. Commit your changes:

```bash
git add .
git commit -m "Add feature"
```

4. Push your branch:

```bash
git push origin feature/your-feature-name
```

5. Open a Pull Request for review.

---

## Tech Stack

### Backend

* FastAPI
* SQLAlchemy
* PostgreSQL
* Alembic
* Shared OperiX Supabase Auth

### Frontend

* Vite
* React
* Axios
* Recharts

### Database

* PostgreSQL
