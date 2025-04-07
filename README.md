# Quits - Subscription Tracker

A full-stack application that helps users track and manage their subscriptions by scanning emails for confirmation emails, using AI to extract subscription details, and providing a dashboard to manage them.

## Project Structure

The project is split into two main parts:

- **Frontend**: React application with Tailwind CSS and Vite
- **Backend**: Express.js API with Supabase database integration

## Features

- Google OAuth 2.0 authentication
- Email scanning with Gmail API
- AI-powered subscription detection and details extraction with Gemini
- Dashboard for subscription management
- Manual subscription management
- Spending insights and upcoming renewal reminders

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Supabase account and project
- Google Cloud Platform account with Gmail API and OAuth credentials
- Gemini API key

### Setup and Installation

#### Backend

1. Navigate to the backend directory:

```
cd backend
```

2. Install dependencies:

```
npm install
```

3. Create a `.env` file based on `.env.example`:

```
cp .env.example .env
```

4. Fill in the environment variables in the `.env` file:

```
# Server Configuration
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Google API Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Gemini API
GEMINI_API_KEY=your_gemini_api_key

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key

# JWT Secret
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

5. Start the development server:

```
npm run dev
```

#### Frontend

1. Navigate to the frontend directory:

```
cd frontend
```

2. Install dependencies:

```
npm install
```

3. Create a `.env` file:

```
VITE_API_URL=http://localhost:3000/api
```

4. Start the development server:

```
npm run dev
```

### Running the Application

For local development, you'll need to run both the backend and frontend servers simultaneously:

1. Start the backend server (from the root directory):

```
cd backend && npm run dev
```

2. In a separate terminal, start the frontend server:

```
cd frontend && npm run dev
```

3. The frontend application will be available at http://localhost:5173
4. The backend API will be running at http://localhost:3000/api

### Database Schema

Create the following tables in your Supabase project:

#### Users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR NOT NULL UNIQUE,
  name VARCHAR,
  avatar_url VARCHAR,
  google_id VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### User Tokens

```sql
CREATE TABLE user_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id)
);
```

#### Subscriptions

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR DEFAULT 'USD',
  billing_cycle VARCHAR NOT NULL,
  next_billing_date DATE,
  provider VARCHAR,
  category VARCHAR,
  email_id VARCHAR,
  is_manual BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Deployment

### Frontend

Deploy to Vercel:

1. Push your frontend code to a GitHub repository
2. Connect the repository to Vercel
3. Set the build command to `npm run build`
4. Set the output directory to `dist`
5. Add the environment variable `VITE_API_URL` pointing to your deployed API

### Backend

Deploy to Vercel:

1. Push your backend code to a GitHub repository
2. Connect the repository to Vercel
3. Set the build command to `npm run build`
4. Set the root directory to the backend folder
5. Add all required environment variables

## License

This project is licensed under the MIT License. 