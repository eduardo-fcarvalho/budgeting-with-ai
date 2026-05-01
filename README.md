# 📊 Budgeting with AI

A Spring Boot backend service for **voice-based expense tracking**, leveraging AI for transcription, interpretation, and audio response generation.

---

## 📌 Overview

This service allows users to register expenses using natural speech, for example:

> “I spent 30 reais at the market”

The system:

1. Transcribes the audio (Speech-to-Text)
2. Interprets the content using AI (LLM)
3. Structures financial data
4. Persists it into a database
5. Returns an audio response (Text-to-Speech)

---

## 🚀 Features

- 🎙️ Audio transcription using **OpenAI Whisper**
- 🧠 Natural language understanding with **LLMs**
- 💾 Data persistence using **Spring Data JPA**
- 🔊 Audio response generation (TTS)
- 🌐 REST API with Spring Boot
- 📄 Automatic API documentation with Swagger

---

## 🧱 Tech Stack

### Core

- Java 25
- Spring Boot 4
- Maven

### Backend

- Spring Web MVC
- Spring Data JPA
- Lombok

### AI / ML

- Spring AI
- OpenAI API
  - `gpt-4o-mini` (interpretation)
  - `whisper-1` (transcription)
  - `gpt-4o-mini-tts` (audio generation)

### Database

- MySQL

### Docs

- SpringDoc OpenAPI (Swagger UI)

---

## ⚙️ Setup & Run

### Prerequisites

- JDK 25
- Maven
- MySQL running
- OpenAI API Key

---

### 1. Clone

```bash
git clone https://github.com/eduardo-fcarvalho/budgeting-with-ai.git
cd budgeting-with-ai
```

### 2. Configure environment variables

```bash
export OPENAI_API_KEY=your_api_key_here
```

### 3. Start dependencies (Docker Compose)

This project uses **Spring Boot Docker Compose support**, which automatically starts required services defined in a `compose.yml` file.

When the application starts, Spring Boot will:

- Detect the `compose.yml` file
- Automatically run `docker compose up`
- Configure connection properties (e.g., database URL) dynamically

> ⚠️ Make sure Docker is running on your machine.

No manual database setup is required.



### 4. Running the application


#### Option 1: IDE (Recommended)
---
If you're using an IDE like IntelliJ or Eclipse:

- Simply run the main class (`BudgetingApplication`)
- Spring Boot will:
  - Start the application
  - Automatically provision dependencies via Docker Compose (if configured)

> ⚠️ Make sure Docker is running.



#### Option 2: Command Line
---
```bash
mvn spring-boot:run
```

or 

```bash
java -jar target/budgeting-0.0.1-SNAPSHOT.jar
```

```markdown
> Note: Most modern IDEs handle build and startup automatically.
> CLI instructions are provided for consistency and CI/CD environments.
```

---
### 🐳 Docker Integration

This project leverages Spring Boot's native Docker Compose integration (`spring-boot-docker-compose`).

This means:

- No need to manually start the database
- No need to configure connection URLs
- Everything is wired automatically at runtime

Just run the application and dependencies will be provisioned.
---

## 🔄 Application Flow
```markdown
Audio Input
   ↓
Whisper (Speech-to-Text)
   ↓
LLM (Extract financial data)
   ↓
JPA (Persist data)
   ↓
TTS (Generate audio response)
   ↓
API Response
```

---

## 🧠 AI Configuration

Relevant configuration (application.properties):

Transcription:

Model: whisper-1

Language: PT-BR
Custom prompt for financial context
Chat:
Model: gpt-4o-mini
Temperature: 0.7
TTS:
Model: gpt-4o-mini-tts
Voice: nova
Output: MP3

---
## 🧠 AI Configuration

Relevant configuration (`application.properties`):

- **Transcription:**
  - Model: `whisper-1`
  - Language: PT-BR
  - Custom prompt for financial context

- **Chat:**
  - Model: `gpt-4o-mini`
  - Temperature: 0.7

- **TTS (Text-to-Speech):**
  - Model: `gpt-4o-mini-tts`
  - Voice: `nova`
  - Output: MP3

---
## 📡 API Endpoints

### 🧾 Transactions

#### `POST /transactions`

Creates a new transaction manually.

**Request Body**

```json
{
  "description": "Lunch at restaurant",
  "category": "GROCERIES",
  "amount": 50
}
```
**Response(201)**
```json
{
  "id": "uuid",
  "category": "GROCERIES",
  "description": "Lunch at restaurant",
  "amount": 50.0
}
```
---

#### `GET /transactions/category`
Retrieves transactions filtered by category.

| Parameter | Type |    Description |
|----------|------|-------------|
| category | String | One of:`GROCERIES`,`PHARMA`,`AUTO` |

**Response(200)**
```json
[
  {
    "id": "uuid",
    "category": "GROCERIES",
    "description": "Supermarket",
    "amount": 120.0
  }
]
```
---
### 🤖 AI Processing
### `POST /transactions/ai`
Processes an audio file and creates a transaction automatically.

**Content-type** 

```http
multipart/form-data
```



| Parameter | Type | Required | Description |
|----------|------|----------|-------------|
| file | binary | Yes | Audio file with expense description |


**Response(200)**


Returns generated audio response (`audio/mp3`).

**Status Codes**

| Code | Description |
|------|-------------|
| 200 | OK |
| 201 | Created |

---
### 📚 Swagger

Access locally:

```http
http://localhost:8080/swagger-ui/index.html
```

---
## 🗂️ Project Structure

```bash
src/main/java/com/eduardo/budgeting/
├── application/                 # Use cases (application layer)
│   ├── input/                  # Input boundaries (use case requests)
│   ├── output/                 # Output boundaries (use case responses)
│   ├── PersistTransactionUseCase
│   └── ListTransactionsByCategoryUseCase
│
├── domain/                     # Core business logic
│   ├── Transaction             # Entity
│   ├── TransactionID           # Value Object
│   ├── Category                # Enum
│   └── TransactionRepository   # Domain interface (port)
│
├── infrastructure/             # Adapters & external concerns
│   ├── http/
│   │   ├── request/           # HTTP request models
│   │   ├── response/          # HTTP response models
│   │   └── TransactionController
│   │
│   └── persistence/           # Database implementation
│
└── BudgetingApplication.java  # Entry point
```

---
## ⚠️ Caveats & Considerations

- **External AI Dependency**  
  The service relies heavily on OpenAI APIs, which may introduce latency and variable operational costs.

- **Natural Language Variability**  
  Parsing results depend on AI interpretation and may produce inconsistent outputs depending on input phrasing.

- **Database Configuration**  
  The current setup uses `ddl-auto=update`, which is convenient for development but not recommended for production environments.

- **Authentication & Security**  
  No authentication or authorization mechanisms are implemented yet.

- **Environment Configuration**  
  The project does not currently separate configurations for different environments (e.g., development, staging, production).


---

## 👤 Author

**Eduardo Carvalho**  

- GitHub: https://github.com/eduardo-fcarvalho  
- LinkedIn: https://www.linkedin.com/in/eduardo-carvalho-25632b98/
