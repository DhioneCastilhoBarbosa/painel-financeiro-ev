-- Habilita extensão TimescaleDB para séries temporais
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Row-Level Security será configurada via Alembic após criação das tabelas
