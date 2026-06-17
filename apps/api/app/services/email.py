"""
Serviço de e-mail via Resend.
Todas as funções são no-op silenciosas quando RESEND_API_KEY não está configurado,
para que o desenvolvimento local funcione sem conta Resend.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)

# SMTP tem prioridade quando smtp_host está configurado
_smtp_available = bool(settings.smtp_host)

# Inicializa Resend apenas quando a chave está disponível
_resend_available = bool(settings.resend_api_key)
if _resend_available:
    import resend as _resend

    _resend.api_key = settings.resend_api_key


def _from() -> str:
    return f"Intelbras Finance <{settings.email_from}>"


def _smtp_from() -> str:
    return settings.smtp_from or settings.smtp_user or settings.email_from


def _html_to_plain(html: str) -> str:
    """Extrai texto plano simples do HTML para alternativa text/plain."""
    import re

    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.IGNORECASE)
    text = re.sub(r"</p>|</tr>|</div>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _send_via_smtp(to: str, subject: str, html: str) -> bool:
    """Envia via servidor SMTP (postal.intelbras.com.br por padrão)."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = _smtp_from()
        msg["To"] = to
        # text/plain primeiro (fallback), html por último (preferido)
        msg.attach(MIMEText(_html_to_plain(html), "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
            server.ehlo()
            if settings.smtp_use_tls:
                # SECLEVEL=1 allows the smaller DH keys used by postal.intelbras.com.br
                ctx = ssl.create_default_context()
                ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
                server.starttls(context=ctx)
                server.ehlo()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(_smtp_from(), [to], msg.as_string())
        return True
    except Exception as exc:
        logger.error("Erro ao enviar e-mail SMTP para %s: %s", to, exc)
        return False


def _app_url() -> str:
    return settings.app_url.rstrip("/")


def _send_sync(to: str, subject: str, html: str) -> bool:
    """Versão síncrona — usada por Celery tasks (sem event loop)."""
    # SMTP tem prioridade quando configurado
    if _smtp_available:
        return _send_via_smtp(to, subject, html)
    if not _resend_available:
        logger.info("[EMAIL no-op] To=%s | Subject=%s", to, subject)
        return False
    try:
        import resend as _resend

        _resend.Emails.send(
            {
                "from": _from(),
                "to": to,
                "subject": subject,
                "html": html,
            }
        )
        return True
    except Exception as exc:
        logger.error("Erro ao enviar e-mail para %s: %s", to, exc)
        return False


async def _send(to: str, subject: str, html: str) -> bool:
    """Versão assíncrona — usada por endpoints FastAPI."""
    return _send_sync(to, subject, html)


_BTN_STYLE = (
    "display:inline-block;background:#06CB3F;color:#163134 !important;"
    "padding:12px 28px;border-radius:8px;text-decoration:none !important;"
    "font-weight:600;margin:20px 0;font-family:Arial,sans-serif;font-size:14px;"
    "mso-padding-alt:0;"
)


def _btn(url: str, label: str) -> str:
    """Botão inline-styled — funciona em todos os clientes de e-mail."""
    return f'<a href="{url}" style="{_BTN_STYLE}" target="_blank">{label}</a>'


def _base_template(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{{font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:0}}
  .wrap{{max-width:520px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden}}
  .header{{background:#163134;padding:24px 32px;text-align:center}}
  .header h1{{color:#06CB3F;font-size:20px;margin:0}}
  .body{{padding:32px}}
  .footer{{background:#f1f5f9;padding:16px 32px;text-align:center;font-size:12px;color:#64748b}}
  p{{color:#334155;line-height:1.6}}
</style>
</head>
<body>
  <div class="wrap">
    <div class="header"><h1>Intelbras Finance</h1></div>
    <div class="body">
      <h2 style="color:#1e293b;margin-top:0">{title}</h2>
      {body_html}
    </div>
    <div class="footer">Intelbras Finance · Gestão Financeira de Eletropostos<br>Este e-mail foi gerado automaticamente, não responda.</div>
  </div>
</body></html>"""


def _cash_flow_chart_html(projections: list) -> str:
    """Gráfico de barras HTML compatível com clientes de e-mail (sem SVG/canvas)."""
    if not projections:
        return ""
    pts = projections[:24]
    values = [p.get("cumulative", 0) for p in pts]
    abs_max = max((abs(v) for v in values), default=1) or 1
    chart_h = 80
    payback_month = next((p["month"] for p in pts if p.get("cumulative", 0) >= 0), None)

    bars = ""
    for p in pts:
        v = p.get("cumulative", 0)
        h = max(2, int(abs(v) / abs_max * chart_h))
        color = "#06CB3F" if v >= 0 else "#ef4444"
        bars += (
            f'<td valign="bottom" style="vertical-align:bottom;padding:0 1px">'
            f'<table cellpadding="0" cellspacing="0" style="width:100%"><tr>'
            f'<td height="{h}" bgcolor="{color}" style="background-color:{color};height:{h}px;'
            f'font-size:0;line-height:{h}px">&nbsp;</td>'
            f"</tr></table></td>"
        )

    labels = ""
    for p in pts:
        m = p["month"]
        label = str(m) if m % 6 == 0 or m == 1 else "&nbsp;"
        labels += f'<td style="text-align:center;font-size:9px;color:#94a3b8;padding:2px 0">{label}</td>'

    payback_html = (
        f'<p style="text-align:center;color:#059669;font-size:12px;font-weight:600;margin:6px 0 0 0">'
        f"Payback no mes {payback_month}</p>"
        if payback_month
        else ""
    )

    return (
        f'<div style="background:#f0fdf4;border-radius:8px;padding:16px;border:1px solid #bbf7d0;margin:20px 0">'
        f'<p style="font-weight:700;color:#163134;margin:0 0 8px 0;font-size:13px">'
        f"Fluxo de Caixa Acumulado &mdash; {len(pts)} meses</p>"
        f'<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;table-layout:fixed">'
        f"<tbody>"
        f'<tr style="height:{chart_h}px" valign="bottom">{bars}</tr>'
        f"<tr>{labels}</tr>"
        f"</tbody></table>"
        f"{payback_html}"
        f"</div>"
    )


async def send_verify_email(to: str, name: str, token: str) -> bool:
    url = f"{_app_url()}/verify-email?token={token}"
    html = _base_template(
        "Verifique seu e-mail",
        f"""<p>Olá, <strong>{name}</strong>!</p>
<p>Obrigado por criar sua conta no Intelbras Finance. Clique no botão abaixo para verificar seu e-mail e ativar sua conta.</p>
<p style="text-align:center">{_btn(url, "Verificar e-mail")}</p>
<p style="font-size:13px;color:#64748b">Se você não criou uma conta no Intelbras Finance, ignore este e-mail.<br>O link expira em <strong>1 hora</strong>.</p>""",
    )
    return await _send(to, "Verifique seu e-mail — Intelbras Finance", html)


async def send_reset_password_email(to: str, name: str, token: str) -> bool:
    url = f"{_app_url()}/reset-password?token={token}"
    html = _base_template(
        "Redefinir senha",
        f"""<p>Olá, <strong>{name}</strong>!</p>
<p>Recebemos uma solicitação de redefinição de senha para sua conta. Clique no botão abaixo para criar uma nova senha.</p>
<p style="text-align:center">{_btn(url, "Redefinir senha")}</p>
<p style="font-size:13px;color:#64748b">Se você não solicitou a redefinição, ignore este e-mail. Sua senha não será alterada.<br>O link expira em <strong>1 hora</strong>.</p>""",
    )
    return await _send(to, "Redefinição de senha — Intelbras Finance", html)


async def send_invite_email(to: str, org_name: str, role_label: str, token: str) -> bool:
    url = f"{_app_url()}/accept-invite?token={token}"
    html = _base_template(
        f"Você foi convidado para {org_name}",
        f"""<p>Você recebeu um convite para ingressar na organização <strong>{org_name}</strong> no Intelbras Finance como <strong>{role_label}</strong>.</p>
<p>Clique no botão abaixo para aceitar o convite e criar sua conta.</p>
<p style="text-align:center">{_btn(url, "Aceitar convite")}</p>
<p style="font-size:13px;color:#64748b">O link expira em <strong>48 horas</strong>. Se você não esperava este convite, ignore este e-mail.</p>""",
    )
    return await _send(to, f"Convite para {org_name} — Intelbras Finance", html)


async def send_trial_ending_email(to: str, name: str, days_left: int) -> bool:
    html = _base_template(
        "Seu período de teste está acabando",
        f"""<p>Olá, <strong>{name}</strong>!</p>
<p>Seu período de teste gratuito do Intelbras Finance termina em <strong>{days_left} dia{"s" if days_left != 1 else ""}</strong>.</p>
<p>Para continuar usando todas as funcionalidades, escolha um plano:</p>
<p style="text-align:center">{_btn(f"{_app_url()}/dashboard/billing", "Ver planos")}</p>""",
    )
    return await _send(to, "Seu trial termina em breve — Intelbras Finance", html)


# ─── Lead / Simulador ─────────────────────────────────────────────────────────


def _fmt_brl(value: float) -> str:
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


async def send_lead_confirmation_email(
    to: str, name: str, sim: dict, message: str | None = None
) -> bool:
    payback = sim.get("payback_months")
    payback_str = (
        f"{payback:.0f} meses (~{sim.get('payback_years', 0):.1f} anos)"
        if payback
        else "Acima de 5 anos"
    )
    chart_html = _cash_flow_chart_html(sim.get("monthly_projections", []))
    html = _base_template(
        f"Sua análise de investimento está aqui, {name.split()[0]}!",
        f"""
<p>Olá, <strong>{name.split()[0]}</strong>! Confira abaixo os resultados da simulação de investimento em estações de recarga:</p>

<table style="width:100%;border-collapse:collapse;margin:20px 0">
  <tr style="background:#f1f5f9">
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Modelo selecionado</td>
    <td style="padding:10px 14px;font-weight:700;color:#1e293b">{sim.get("charger_type", "—")} × {sim.get("num_chargers", 1)} pontos</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Investimento (CAPEX)</td>
    <td style="padding:10px 14px;font-weight:700;color:#1e293b">{_fmt_brl(sim.get("capex", 0))}</td>
  </tr>
  <tr style="background:#f1f5f9">
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Receita mensal estimada</td>
    <td style="padding:10px 14px;font-weight:700;color:#059669">{_fmt_brl(sim.get("monthly_revenue", 0))}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Lucro líquido mensal</td>
    <td style="padding:10px 14px;font-weight:700;color:#059669">{_fmt_brl(sim.get("monthly_net", 0))}</td>
  </tr>
  <tr style="background:#f1f5f9">
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Payback estimado</td>
    <td style="padding:10px 14px;font-weight:700;color:#163134">{payback_str}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;font-size:13px;color:#64748b">ROI em 5 anos</td>
    <td style="padding:10px 14px;font-weight:700;color:#06CB3F">{sim.get("roi_5y_pct", 0):.1f}%</td>
  </tr>
</table>

{chart_html}

<p style="font-size:13px;color:#64748b;background:#fef9c3;border:1px solid #fde047;padding:12px;border-radius:8px">
  AVISO: Esta é uma simulação estimada com parâmetros médios de mercado. Os resultados reais dependerão de localização,
  demanda local, tarifas de energia e outros fatores operacionais.
</p>

<p>Quer uma análise personalizada e detalhada para o seu negócio? Nossa equipe está pronta para ajudar.</p>
<p style="text-align:center">{_btn("mailto:grupo.mobilidadeeletrica@intelbras.com.br", "Falar com especialista")}</p>
""",
    )
    return await _send(to, "Sua simulação de retorno em estações de recarga - Intelbras Finance", html)


async def send_lead_notification_email(
    to: str,
    lead_name: str,
    lead_email: str,
    lead_phone: str,
    state: str,
    city: str,
    charger_type: str,
    sector: str,
    position: str,
    num_chargers: int,
    sim: dict,
    cnpj: str | None = None,
    message: str | None = None,
) -> bool:
    payback = sim.get("payback_months")
    payback_str = f"{payback:.0f} meses" if payback else "Acima de 5 anos"
    html = _base_template(
        "Novo lead — Simulador de Investimento",
        f"""
<p>Um novo lead realizou a simulação de investimento em estações de recarga:</p>

<table style="width:100%;border-collapse:collapse;margin:16px 0">
  <tr style="background:#f0fdf4"><td colspan="2" style="padding:8px 14px;font-weight:700;color:#163134;font-size:13px">DADOS DO LEAD</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b;width:40%">Nome</td><td style="padding:8px 14px;font-weight:600">{lead_name}</td></tr>
  <tr style="background:#f8fafc"><td style="padding:8px 14px;font-size:13px;color:#64748b">CNPJ</td><td style="padding:8px 14px">{cnpj or "—"}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b">E-mail</td><td style="padding:8px 14px"><a href="mailto:{lead_email}">{lead_email}</a></td></tr>
  <tr style="background:#f8fafc"><td style="padding:8px 14px;font-size:13px;color:#64748b">Telefone</td><td style="padding:8px 14px"><a href="tel:{lead_phone}">{lead_phone}</a></td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b">Localização</td><td style="padding:8px 14px">{city} / {state}</td></tr>
  <tr style="background:#f8fafc"><td style="padding:8px 14px;font-size:13px;color:#64748b">Setor</td><td style="padding:8px 14px">{sector}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b">Cargo</td><td style="padding:8px 14px">{position}</td></tr>
  {f'<tr style="background:#fff9e6"><td style="padding:8px 14px;font-size:13px;color:#64748b">Mensagem</td><td style="padding:8px 14px;font-style:italic">{message}</td></tr>' if message else ""}

  <tr style="background:#f0fdf4"><td colspan="2" style="padding:8px 14px;font-weight:700;color:#163134;font-size:13px">SIMULAÇÃO</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b">Carregador</td><td style="padding:8px 14px;font-weight:600">{charger_type} × {num_chargers} pontos</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b">Receita/mês</td><td style="padding:8px 14px;color:#059669;font-weight:600">{_fmt_brl(sim.get("monthly_revenue", 0))}</td></tr>
  <tr style="background:#f8fafc"><td style="padding:8px 14px;font-size:13px;color:#64748b">Payback</td><td style="padding:8px 14px;font-weight:600">{payback_str}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b">ROI 5 anos</td><td style="padding:8px 14px;font-weight:600">{sim.get("roi_5y_pct", 0):.1f}%</td></tr>
</table>

<p style="text-align:center">{_btn(f"{_app_url()}/dashboard/leads", "Ver todos os leads")}</p>
""",
    )
    return await _send(
        to, f"Novo lead: {lead_name} ({charger_type} x {num_chargers}) - Intelbras Finance", html
    )


async def send_specialist_contact_notification(
    to: str,
    lead_name: str,
    lead_email: str,
    lead_phone: str,
    charger_type: str,
    sector: str,
    specialist_message: str,
    lead_id: str,
) -> bool:
    html = _base_template(
        "Lead quer falar com um especialista",
        f"""
<p><strong>{lead_name}</strong> ({lead_email}) enviou uma mensagem pedindo contato com especialista:</p>

<blockquote style="border-left:4px solid #06CB3F;margin:16px 0;padding:12px 16px;background:#f0fdf4;border-radius:0 8px 8px 0;font-style:italic;color:#334155">
  "{specialist_message}"
</blockquote>

<table style="width:100%;border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b;width:40%">Carregador</td><td style="padding:8px 14px">{charger_type}</td></tr>
  <tr style="background:#f8fafc"><td style="padding:8px 14px;font-size:13px;color:#64748b">Setor</td><td style="padding:8px 14px">{sector}</td></tr>
  <tr><td style="padding:8px 14px;font-size:13px;color:#64748b">Telefone</td><td style="padding:8px 14px"><a href="tel:{lead_phone}">{lead_phone}</a></td></tr>
</table>

<p style="text-align:center">{_btn(f"{_app_url()}/dashboard/leads", "Ver lead no CRM")}</p>
""",
    )
    return await _send(to, f"{lead_name} quer falar com especialista - Intelbras Finance", html)


# ─── Feedback (sugestões / reclamações) ───────────────────────────────────────


async def send_feedback_response_email(
    to: str, name: str, feedback_type: str, title: str, response: str
) -> bool:
    type_label = "sugestão" if feedback_type == "suggestion" else "reclamação"
    first = name.split()[0] if name else "Olá"
    html = _base_template(
        "Resposta à sua " + type_label,
        f"""
<p>Olá, <strong>{first}</strong>!</p>
<p>Recebemos a sua {type_label} <strong>"{title}"</strong> e temos uma resposta para você:</p>

<blockquote style="border-left:4px solid #06CB3F;margin:16px 0;padding:12px 16px;background:#f0fdf4;border-radius:0 8px 8px 0;color:#334155">
  {response}
</blockquote>

<p>Agradecemos por nos ajudar a melhorar a plataforma!</p>
""",
    )
    return await _send(to, f"Resposta à sua {type_label} — Intelbras Finance", html)


# ─── Alertas ──────────────────────────────────────────────────────────────────


def send_alert_triggered_email_sync(
    to: str,
    alert_name: str,
    metric_label: str,
    operator_label: str,
    threshold_fmt: str,
    value_fmt: str,
    org_name: str,
    evaluation_date: str,
) -> bool:
    """
    Notifica o criador do alerta quando ele é disparado.
    Versão síncrona — chamada diretamente pelo Celery task (sem event loop).
    """
    html = _base_template(
        f"Alerta disparado: {alert_name}",
        f"""
<p>O alerta <strong>"{alert_name}"</strong> foi acionado para a organização <strong>{org_name}</strong>.</p>

<table style="width:100%;border-collapse:collapse;margin:20px 0">
  <tr style="background:#fef3c7">
    <td style="padding:10px 14px;font-size:13px;color:#92400e">Alerta</td>
    <td style="padding:10px 14px;font-weight:700;color:#78350f">{alert_name}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Métrica</td>
    <td style="padding:10px 14px;font-weight:600">{metric_label}</td>
  </tr>
  <tr style="background:#f8fafc">
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Condição</td>
    <td style="padding:10px 14px">{operator_label} <strong>{threshold_fmt}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Valor observado</td>
    <td style="padding:10px 14px;font-weight:700;color:#dc2626">{value_fmt}</td>
  </tr>
  <tr style="background:#f8fafc">
    <td style="padding:10px 14px;font-size:13px;color:#64748b">Data de avaliação</td>
    <td style="padding:10px 14px">{evaluation_date}</td>
  </tr>
</table>

<p style="font-size:13px;color:#64748b;background:#fef9c3;border:1px solid #fde047;padding:12px;border-radius:8px">
  Este alerta não será re-disparado nas próximas 24 horas.
</p>

<p style="text-align:center">{_btn(f"{_app_url()}/dashboard", "Acessar Dashboard")}</p>
""",
    )
    return _send_sync(to, f"Alerta: {alert_name} - {org_name} | Intelbras Finance", html)
