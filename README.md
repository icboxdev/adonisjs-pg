# Enterprise Backend API | AdonisJS v6

Este é um backend **stateless** de alta performance desenvolvido com **AdonisJS v6**. A aplicação é focada exclusivamente em fornecer uma infraestrutura de API robusta, com autenticação avançada, sistema de cache distribuído e suporte a integrações externas.

## 🛠️ Tech Stack & Infrastructure

* **Framework:** [AdonisJS v6](https://docs.adonisjs.com/guides/introduction) (Pure API Mode)
* **Language:** TypeScript
* **Runtime:** Node.js v20+
* **Database:** PostgreSQL (Lucid ORM)
* **Cache & Transport:** [Redis](https://redis.io/)
* **Validation:** VineJS

## 🔐 Authentication & Security

A API conta com um sistema de autenticação híbrido e resiliente:

* **Access Tokens (OAT):** Autenticação padrão para usuários/clientes da plataforma.
* **API Key Management:** Sistema integrado para geração, expiração e revogação de chaves de API, ideal para parceiros e automações.
* **Security-First:** Proteção nativa contra ataques comuns e gerenciamento rigoroso de permissões.

## 🚀 Key Features

* **Redis Caching:** Camada de cache otimizada para redução de latência e carga no banco de dados.
* **Webhooks (Gatilhos):** Sistema de gatilhos para integração ativa com plataformas externas, permitindo arquiteturas baseadas em eventos.
* **Service Layer:** Toda a lógica de negócio, inclusive o gerenciamento de API Keys, está isolada em serviços testáveis.
* **High Availability:** Arquitetura pronta para escalabilidade horizontal.

## ⚙️ Setup & Installation

### Prerequisites

* Node.js v20.x+
* PostgreSQL
* Redis Instance

### Quick Start

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/adonisjs/adonisjs.git](https://github.com/adonisjs/adonisjs.git)
    cd adonisjs
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configuração de Ambiente:**
    ```bash
    cp .env.example .env
    # Certifique-se de configurar as credenciais do Redis e DB
    ```

4.  **Database & Migrations:**
    ```bash
    node ace migration:run
    ```

5.  **Running:**
    ```bash
    npm run dev
    ```

## 📂 Arquitetura do Sistema

```text
├── app/
│   ├── Controllers/    # Endpoints da API
│   ├── Models/         # Lucid Models (User, ApiKey, etc.)
│   ├── Services/       # Business Logic (Auth, Cache, Webhooks)
│   ├── Validators/     # Validações VineJS
│   └── Middleware/     # Auth Guards & Cache Handlers
├── config/             # Redis, Auth, e App configs
├── database/           # Migrations & Seeders
├── start/              # API Routes
└── tests/              # Japa Test Suites
