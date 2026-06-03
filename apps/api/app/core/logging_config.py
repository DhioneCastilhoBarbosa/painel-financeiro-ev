"""
Configuração de logging estruturado JSON para produção.

Em desenvolvimento (DEBUG=true) usa formato legível no terminal.
Em produção usa JSON para facilitar ingestão por CloudWatch / Datadog / Loki.

Uso:
    from app.core.logging_config import setup_logging
    setup_logging()   # chamar uma vez no startup da aplicação
"""
from __future__ import annotations

import logging
import sys

from app.core.config import settings

_CONFIGURED = False


class _JsonFormatter(logging.Formatter):
    """
    Formata log records como JSON puro, sem dependências externas.
    Cada linha é um JSON válido para facilitar parsing por coletores de log.
    """

    import json as _json

    def format(self, record: logging.LogRecord) -> str:
        import json
        from datetime import UTC, datetime

        payload: dict = {
            "ts":      datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level":   record.levelname,
            "logger":  record.name,
            "msg":     record.getMessage(),
        }

        # Contexto extra (passado via logger.info(..., extra={...}))
        for key in vars(record):
            if key not in (
                "name", "msg", "args", "levelname", "levelno", "pathname",
                "filename", "module", "exc_info", "exc_text", "stack_info",
                "lineno", "funcName", "created", "msecs", "relativeCreated",
                "thread", "threadName", "processName", "process", "message",
            ):
                payload[key] = getattr(record, key)

        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)


def setup_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    _CONFIGURED = True

    level = logging.DEBUG if settings.debug else logging.INFO

    handler = logging.StreamHandler(sys.stdout)

    if settings.debug:
        # Formato legível para desenvolvimento
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
                datefmt="%H:%M:%S",
            )
        )
    else:
        # JSON estruturado para produção
        handler.setFormatter(_JsonFormatter())

    # Configura o root logger
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    # Silencia loggers muito verbosos
    for noisy in ("uvicorn.access", "sqlalchemy.engine", "httpx"):
        logging.getLogger(noisy).setLevel(
            logging.INFO if settings.debug else logging.WARNING
        )

    logging.getLogger("uvicorn.error").setLevel(logging.INFO)
