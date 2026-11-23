# Local Development & Setup Guide
## Missive Digital SEO Intelligence Platform

This guide provides step-by-step instructions to set up, run, and test the entire platform on a local development workstation.

---

## 1. System Requirements

- **Operating System:** macOS (Apple Silicon / Intel), Linux (Ubuntu 22.04+), or Windows 10/11 (with WSL2 or PowerShell).
- **Node.js:** v20.12.0 LTS or v22.x LTS (`node -v`).
- **Package Manager:** npm v10+ (bundled with Node).
- **Docker & Docker Compose:** Optional but recommended for instant local MySQL and Redis infrastructure.
- **Ollama:** Required for local AI assistant features ([ollama.com](https://ollama.com)).

---

## 2. Infrastructure Setup Options

You can run MySQL and Redis either via **Docker Compose** (recommended) or **Native Local Services**.

### Option A: Docker Compose (Recommended)
From the repository root, start MySQL 8.0 and Redis 7 in the background:

```bash
docker compose up -d
```

Verify services are healthy:
```bash
docker compose ps
```
- MySQL runs on `localhost:3306` (database: `missive_seo`, user: `missive_user`, password: `change_me_password`).
- Redis runs on `localhost:6379`.

### Option B: Native Services
- **MySQL 8.0:** Ensure MySQL is running on port 3306 and create the database:
  ```sql
  CREATE DATABASE missive_seo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'missive_user'@'localhost' IDENTIFIED BY 'change_me_password';
  GRANT ALL PRIVILEGES ON missive_seo.* TO 'missive_user'@'localhost';
  FLUSH PRIVILEGES;
  ```
- **Redis 7:** Start Redis locally on default port 6379:
  ```bash
  redis-server
  ```

---

## 3. Local AI Setup (Ollama + Qwen)

1. **Install Ollama:**
   - Download and install Ollama from [ollama.com/download](https://ollama.com/download).
   - Start the Ollama daemon:
     ```bash
     ollama serve
     ```
2. **Download the Recommended Qwen Model:**
   ```bash
   ollama pull qwen2.5:7b-instruct
   ```
   *(For low-RAM machines with < 16GB RAM, `qwen2.5:3b` or `qwen2.5:1.5b` can also be used by setting `OLLAMA_MODEL=qwen2.5:3b` in `.env`)*.

3. **Verify Ollama Availability:**
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```

---

## 4. Backend Configuration & Installation

1. **Navigate to the backend directory:**
   ```bash
   cd backend
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure Environment Variables:**
   ```bash
   cp ../.env.example .env
   ```
   Generate random keys and paste them into `.env`:
   ```bash
   # Generate 64-character random hex keys for JWT and Refresh tokens:
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

   # Generate 32-byte (64 hex characters) key for ENCRYPTION_KEY:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. **Run Prisma Migrations:**
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Seed Initial Roles & Permissions:**
   ```bash
   npm run db:seed
   ```

6. **Start the Backend API Server:**
   ```bash
   npm run dev
   ```
   The backend API will start on `http://localhost:3001` with auto-reload.

7. **Start Background Queue Workers (in a separate terminal):**
   ```bash
   npm run workers
   ```

---

## 5. Frontend Configuration & Installation

1. **Navigate to the frontend directory (in a new terminal):**
   ```bash
   cd frontend
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Start the Frontend Development Server:**
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:5173`.

---

## 6. Running Automated Tests

To run the complete verification suite (24 test suites, 183 tests):

```bash
cd backend
npm test
```

To run unit tests only:
```bash
npm run test:unit
```

To run integration tests only:
```bash
npm run test:integration
```

---

## 7. Local MCP Server Testing (STDIO Transport)

To test the Model Context Protocol (MCP) server locally via STDIO:

```bash
cd backend
npm run mcp:stdio
```

You can configure Claude Desktop, Cursor, or Antigravity to connect to this server by adding it to your MCP client settings:

```json
{
  "mcpServers": {
    "missive-seo": {
      "command": "node",
      "args": ["<PATH_TO_BACKEND>/src/mcp/transports/stdio.transport.js"],
      "env": {
        "DATABASE_URL": "mysql://missive_user:change_me_password@localhost:3306/missive_seo",
        "ENCRYPTION_KEY": "YOUR_64_HEX_CHAR_KEY"
      }
    }
  }
}
```

---

## 8. Troubleshooting Common Local Issues

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Prisma `P1001: Can't reach database server`** | MySQL is not running or incorrect port | Ensure MySQL is running via `docker compose ps` or native system service. Verify `DATABASE_URL` in `.env`. |
| **Redis `ECONNREFUSED 127.0.0.1:6379`** | Redis is offline | Run `docker compose up -d redis` or start `redis-server`. |
| **`ENCRYPTION_KEY must be exactly 64 hex characters`** | Invalid key length in `.env` | Run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the 64-char string. |
| **Ollama connection timeout or `model_missing`** | Model not downloaded | Run `ollama pull qwen2.5:7b-instruct` and verify `http://127.0.0.1:11434` is accessible. |
| **Port conflict on 3001 or 5173** | Another process is using the port | Change `PORT=3002` in `.env` and configure `VITE_API_BASE_URL` in frontend. |
