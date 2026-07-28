# DeskDibs

A desk and meeting-room reservation application built with **FastAPI**, **PostgreSQL**, and **Next.js**.

## Prerequisites

Before running the project, make sure you have installed:

* Python 3.12+ (or the version used by the team)
* Node.js and npm
* PostgreSQL
* pgAdmin 4 (optional, for database management)

---

## Database Setup

1. Open PostgreSQL/pgAdmin.
2. Create a new database named:

```sql
deskdibs
```

3. Configure your backend `.env` file:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/deskdibs
```

Replace `YOUR_PASSWORD` with your PostgreSQL password.

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
DeskDibs/
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
* JWT Authentication

### Frontend

* Next.js
* React
* Axios
* Recharts

### Database

* PostgreSQL
