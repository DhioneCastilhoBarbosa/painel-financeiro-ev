FROM python:3.12-slim

WORKDIR /app

# Dependências de sistema para compilar pacotes nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências Python antes de copiar código (melhor cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia código
COPY . .

# Cria usuário não-root para o processo
RUN addgroup --gid 1001 appgroup \
 && adduser  --uid 1001 --gid 1001 --no-create-home --disabled-password appuser \
 && chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000
