"""Optional visual clues for screenshot link recovery.

The model only supplies search clues. Its output is never treated as a verified URL.
"""

import base64
import io
import json
import os
import re
from pathlib import Path

import requests
from PIL import Image
from backend.services.reverse_vision_prompts import GEMINI_PROMPT, OPENAI_PROMPT
from backend.services.reverse_trace import record
from backend.services.screenshot_service import detect_local_proxy


LOCAL_CONFIG = Path(__file__).resolve().parents[2] / ".reverse-image.local.json"


def _vision_config() -> dict[str, str]:
    try:
        saved = json.loads(LOCAL_CONFIG.read_text(encoding="utf-8"))
        if not isinstance(saved, dict):
            saved = {}
    except (OSError, ValueError):
        saved = {}
    return {
        "openai_key": os.getenv("REVERSE_IMAGE_OPENAI_API_KEY") or str(saved.get("openai_api_key") or ""),
        "gemini_key": os.getenv("REVERSE_IMAGE_GEMINI_API_KEY") or str(saved.get("gemini_api_key") or ""),
        "openai_base": os.getenv("REVERSE_IMAGE_OPENAI_BASE_URL") or str(saved.get("openai_base_url") or ""),
        "openai_model": os.getenv("REVERSE_IMAGE_OPENAI_MODEL") or str(saved.get("openai_model") or ""),
    }


def _image_data(image_bytes: bytes) -> str:
    with Image.open(io.BytesIO(image_bytes)) as image:
        output = io.BytesIO()
        image.convert("RGB").save(output, format="JPEG", quality=90)
    return base64.b64encode(output.getvalue()).decode("ascii")


def _parse_clues(raw: str) -> dict[str, str] | None:
    try:
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.I)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        match = re.search(r"\{.*\}", cleaned, re.S)
        if not match:
            return None
        value = json.loads(re.sub(r",\s*([}\]])", r"\1", match.group(0)))
    except (ValueError, AttributeError):
        return None
    if not isinstance(value, dict):
        return None
    clues = {key: str(value.get(key) or "")[:160].strip()
             for key in ("platform", "platform_name", "title", "author", "site_domain", "breadcrumb",
                         "distinctive_text", "language", "id", "search_query")}
    if clues["platform"].casefold() in {"ins", "ig", "instagram"}:
        clues["platform"] = "instagram"
        clues["site_domain"] = "instagram.com"
    return clues if clues["platform"] or clues["title"] else None


def visual_model_configured() -> bool:
    config = _vision_config()
    return bool(config["openai_key"] or config["gemini_key"])


def extract_visual_clues_with_status(image_bytes: bytes) -> tuple[dict[str, str] | None, str]:
    """Return standardized clues and a diagnostic without exposing credentials."""
    config = _vision_config()
    openai_key = config["openai_key"]
    gemini_key = config["gemini_key"]
    if not openai_key and not gemini_key:
        return None, "not_configured"
    try:
        encoded = _image_data(image_bytes)
        proxy = detect_local_proxy()
        proxies = {"http": proxy, "https": proxy} if proxy else None
        if gemini_key:
            endpoint = ("https://generativelanguage.googleapis.com/v1beta/models/"
                        f"{os.getenv('REVERSE_IMAGE_GEMINI_MODEL', 'gemini-2.0-flash')}:generateContent")
            response = requests.post(
                endpoint,
                headers={"x-goog-api-key": gemini_key},
                json={"contents": [{"parts": [
                    {"text": GEMINI_PROMPT}, {"inline_data": {"mime_type": "image/jpeg", "data": encoded}},
                ]}], "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"}},
                proxies=proxies, timeout=15,
            )
            record("model_request", "completed" if response.ok else "failed", "Gemini", endpoint, response.status_code)
            response.raise_for_status()
            clues = _parse_clues(response.json()["candidates"][0]["content"]["parts"][0]["text"])
            return clues, "extracted" if clues else "invalid_response"

        if openai_key:
            base = (config["openai_base"] or
                    "https://ws-dr9ixn9p96kxcvbm.cn-beijing.maas.aliyuncs.com/compatible-mode/v1").rstrip("/")
            model = config["openai_model"] or "qwen-vl-plus"
            endpoint = f"{base}/chat/completions"
            response = requests.post(
                endpoint,
                headers={"Authorization": f"Bearer {openai_key}"},
                json={"model": model, "temperature": 0.1, "messages": [{"role": "user", "content": [
                    {"type": "text", "text": OPENAI_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded}"}},
                ]}]}, proxies=proxies, timeout=25,
            )
            record("model_request", "completed" if response.ok else "failed", model, endpoint, response.status_code)
            response.raise_for_status()
            clues = _parse_clues(response.json()["choices"][0]["message"]["content"])
            return clues, "extracted" if clues else "invalid_response"

        return None, "not_configured"
    except requests.Timeout:
        record("model_request", "timeout", "模型请求超时", locals().get("endpoint", ""))
        return None, "timeout"
    except requests.HTTPError as error:
        code = error.response.status_code if error.response is not None else 0
        return None, "unauthorized" if code in {401, 403} else "rate_limited" if code == 429 else "failed"
    except (OSError, ValueError, KeyError, IndexError, TypeError, requests.RequestException):
        record("model_request", "failed", "请求或响应解析失败", locals().get("endpoint", ""))
        return None, "failed"


def extract_visual_clues(image_bytes: bytes) -> dict[str, str] | None:
    """Compatibility entry point for callers needing only the clues."""
    return extract_visual_clues_with_status(image_bytes)[0]
