"""
Instância compartilhada do rate-limiter (slowapi).
Importar daqui para evitar instâncias duplicadas.

Em produção atrás de nginx / AWS ALB, o IP real do cliente chega no header
X-Forwarded-For. Sem isso, TODOS os requests apareceriam vir do IP do proxy,
tornando o rate limiting ineficaz.
"""

from slowapi import Limiter
from starlette.requests import Request


def _real_ip(request: Request) -> str:
    """
    Extrai o IP real do cliente.

    X-Forwarded-For: <client>, <proxy1>, <proxy2>
    O primeiro IP da lista é o cliente original. Nginx e AWS ALB
    preenchem este header corretamente quando configurados com
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for.

    Em desenvolvimento (sem proxy), usa request.client.host diretamente.
    """
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_real_ip)
