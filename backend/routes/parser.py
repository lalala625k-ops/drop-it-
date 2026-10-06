import json
import base64
import asyncio
import time
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Request
from backend.services.ocr_service import extract_text_from_image
from backend.services.scraper_service import scrape_url_metadata
from backend.services.reverse_direct_service import recover_explicit_link
from backend.services.reverse_resolution_search import (rank_candidates, search_domain,
                                                        search_platform, search_target)
from backend.services.reverse_vision_service import extract_visual_clues_with_status
from backend.services.reverse_qr_service import detect_qr_link
from backend.services.reverse_xiaohongshu_search import search_page_url
from backend.services.reverse_manual_search import build_manual_search
from backend.services.reverse_instagram_caption import extract_instagram_caption
from backend.services.reverse_site_fingerprints import sspai_matrix_page, wechat_article_clues
from backend.services.reverse_trace import begin_trace, record, snapshot

router = APIRouter(prefix="/api", tags=["parser"])

@router.post("/recognize-image")
async def recognize_image(request: Request, file: Optional[UploadFile] = File(None)):
    image_bytes = await _read_image_bytes(request, file)
    started = time.monotonic()
    ocr = await asyncio.to_thread(extract_text_from_image, image_bytes)
    return {**ocr, "diagnostics": [{"name": "ocr", "status": "completed" if ocr.get("success") else "failed",
            "detail": str(ocr.get("error") or ocr.get("text") or "")[:500],
            "count": ocr.get("count", 0)}], "elapsed_ms": round((time.monotonic() - started) * 1000)}


async def _read_image_bytes(request: Request, file: Optional[UploadFile] = None) -> bytes:
    image_bytes = None
    if file:
        image_bytes = await file.read()
    else:
        try:
            body = await request.body()
            if body:
                if body.startswith(b"{"):
                    try:
                        data = json.loads(body.decode("utf-8"))
                        b64_str = data.get("image", "")
                        if "," in b64_str:
                            b64_str = b64_str.split(",", 1)[1]
                        image_bytes = base64.b64decode(b64_str)
                    except Exception:
                        pass
                if not image_bytes:
                    image_bytes = body
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read image body: {str(e)}")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="No image provided")

    return image_bytes


@router.post("/resolve-image")
async def resolve_image(request: Request, file: Optional[UploadFile] = File(None)):
    image_bytes = await _read_image_bytes(request, file)
    begin_trace()
    started = time.monotonic()
    stages = []
    try:
        qr_url = await asyncio.wait_for(asyncio.to_thread(detect_qr_link, image_bytes), timeout=10)
    except asyncio.TimeoutError:
        qr_url = None
        record("qr", "timeout", "二维码预检超时")
    if qr_url:
        record("qr", "matched", "发现二维码链接", qr_url)
        return {"success": True, "title": "", "text": "", "count": 0,
                "url": qr_url, "recognition_method": "qr", "vision_status": "not_needed",
                "diagnostics": snapshot(), "elapsed_ms": round((time.monotonic() - started) * 1000),
                "resolution": {"status": "matched", "reason": "识别到二维码中的原链接",
                               "stages": [{"name": "explicit", "status": "matched"}],
                               "candidates": []}}

    if not qr_url:
        record("qr", "no_results", "没有可用的二维码链接")
    try:
        ocr = await asyncio.wait_for(asyncio.to_thread(extract_text_from_image, image_bytes), timeout=25)
    except asyncio.TimeoutError:
        ocr = {"success": False, "title": "", "text": "", "count": 0,
               "error": "OCR timeout"}
    record("ocr", "completed" if ocr.get("success") else "failed",
           str(ocr.get("text") or ocr.get("error") or "")[:500])
    text = str(ocr.get("text") or "")
    direct = recover_explicit_link(text) if ocr.get("success") else None
    if direct:
        record("explicit", "matched", "OCR 中发现明确标识", direct)
        return {**ocr, "url": direct, "recognition_method": "visible_text",
                "vision_status": "not_needed",
                "diagnostics": snapshot(), "elapsed_ms": round((time.monotonic() - started) * 1000),
                "resolution": {"status": "matched", "reason": "截图中有明确的原链接或编号",
                               "stages": [{"name": "explicit", "status": "matched"}],
                               "candidates": []}}
    stages.append({"name": "explicit", "status": "no_results" if ocr.get("success") else "failed"})

    def result(status: str, reason: str, vision_status: str,
               candidates: list[dict] | None = None, clues: dict | None = None,
               url: str | None = None):
        record("verification", status, reason, url or "")
        return {**ocr, "success": bool(ocr.get("success") or url), "url": url,
                "recognition_method": "vision" if url else None,
                "vision_status": vision_status,
                "diagnostics": snapshot(), "elapsed_ms": round((time.monotonic() - started) * 1000),
                "resolution": {"status": status, "reason": reason, "stages": stages,
                               "candidates": candidates or [],
                               "manual_search": build_manual_search(clues, text),
                               "search_page": search_page_url(clues["title"]) if clues and
                               clues.get("title") and search_target(clues) and
                               search_target(clues)[0] == "xiaohongshu" else None,
                               "clues": {key: clues.get(key, "") for key in
                                         ("platform", "site_domain", "title", "author", "id",
                                          "distinctive_text", "search_query")}
                               if clues else {}}}

    remaining = max(0.1, 90 - (time.monotonic() - started))
    try:
        clues, vision_status = await asyncio.wait_for(
            asyncio.to_thread(extract_visual_clues_with_status, image_bytes),
            timeout=min(30, remaining))
    except asyncio.TimeoutError:
        clues, vision_status = None, "timeout"
    corrected_platform = False
    wechat_clues = wechat_article_clues(ocr)
    if clues and wechat_clues:
        original_platform = str(clues.get("platform") or "")
        original_domain = str(clues.get("site_domain") or "")
        record("vision", vision_status, json.dumps({key: clues.get(key, "") for key in
               ("platform", "site_domain", "title", "author", "id")}, ensure_ascii=False)[:500])
        clues.update(wechat_clues)
        record("platform_correction", "completed",
               f"模型原判 {original_platform} · {original_domain}；顶部大标题、日期时间属地及底部公众号名相互印证，采用外层微信文章标题和公众号")
        corrected_platform = True
    elif clues and sspai_matrix_page(text) and search_target(clues) != ("sspai", "sspai.com"):
        original_platform = str(clues.get("platform") or "")
        original_domain = str(clues.get("site_domain") or "")
        record("vision", vision_status, json.dumps({key: clues.get(key, "") for key in
               ("platform", "site_domain", "title", "author", "id")}, ensure_ascii=False)[:500])
        clues["platform"] = "sspai"
        clues["site_domain"] = "sspai.com"
        record("platform_correction", "completed",
               f"模型原判 {original_platform} · {original_domain}；OCR 命中少数派 Matrix 专属文案，改为 sspai.com")
        corrected_platform = True
    if clues and search_target(clues) and search_target(clues)[0] == "instagram" and not clues.get("title"):
        caption = extract_instagram_caption(ocr, str(clues.get("author") or ""))
        if caption:
            clues["title"] = caption
            record("caption", "completed", f"Instagram OCR 正文作为搜索词：{caption[:120]}")
        else:
            record("caption", "no_results", "Instagram 截图中没有可用的 OCR 正文")
    if not clues or not clues.get("title") or not search_target(clues):
        stage_status = (vision_status if not clues else
                        "missing_title" if not clues.get("title") else "unsupported_platform")
        record("vision", stage_status, "模型未提供可搜索的平台和标题" if not clues else
               json.dumps({"platform": clues.get("platform", ""),
                           "site_domain": clues.get("site_domain", ""),
                           "title": clues.get("title", "")}, ensure_ascii=False))
        stages.append({"name": "vision", "status": stage_status})
        reason = {"not_configured": "未配置视觉模型，无法从截图提取搜索线索",
                  "timeout": "视觉模型请求超时，已停止溯源",
                  "unauthorized": "视觉模型 API Key 无效或没有调用权限",
                  "rate_limited": "视觉模型请求被限流，请稍后重试",
                  "invalid_response": "视觉模型未返回有效的平台和标题",
                  "failed": "视觉模型请求失败，已停止溯源"}.get(vision_status, "视觉模型未返回有效的平台和标题")
        if clues and not clues.get("title"):
            reason = "已识别平台，但截图中没有可确认的帖子配文或标题，无法自动搜索"
        elif clues and not search_target(clues):
            reason = "模型已返回内容，但没有可识别的网站域名，无法定向搜索"
        return result("error", reason, vision_status, clues=clues)
    stages.append({"name": "vision", "status": "completed"})
    if not corrected_platform:
        record("vision", "completed", json.dumps({key: clues.get(key, "") for key in
               ("platform", "site_domain", "title", "author", "id", "distinctive_text", "search_query")}, ensure_ascii=False)[:500])
    platform, domain = search_target(clues)
    record("routing", "completed", f"搜索分发：{platform} · {domain}")

    try:
        site_items, site_status = await asyncio.wait_for(
            asyncio.to_thread(search_platform, clues, text),
            timeout=min(40, max(0.1, 90 - (time.monotonic() - started))))
    except asyncio.TimeoutError:
        site_items, site_status = [], "timeout"
    except Exception:
        site_items, site_status = [], "failed"
    stages.append({"name": "site_search", "status": site_status})
    record("site_search", site_status, f"可核验候选 {len(site_items)} 条")
    ranked = rank_candidates(site_items)
    if ranked and ranked[0]["auto_match"]:
        stages.append({"name": "verification", "status": "matched"})
        return result("matched", "站内搜索找到可信原链接", vision_status,
                      clues=clues, url=ranked[0]["url"])

    if platform == "xiaohongshu":
        stages.append({"name": "domain_search", "status": "skipped"})
        record("domain_search", "skipped", "小红书改由站内结果和人工选择，跳过 Bing")
        stages.append({"name": "verification", "status": "candidates" if ranked else "no_results"})
        if ranked:
            return result("candidates", "找到小红书笔记候选，请选择原帖", vision_status,
                          candidates=ranked, clues=clues)
        return result("not_found", "小红书搜索页未返回可读取的笔记列表，请打开站内搜索并选择原帖",
                      vision_status, clues=clues)

    try:
        domain_items, domain_status = await asyncio.wait_for(
            asyncio.to_thread(search_domain, clues),
            timeout=min(18, max(0.1, 90 - (time.monotonic() - started))))
    except asyncio.TimeoutError:
        domain_items, domain_status = [], "timeout"
    except Exception:
        domain_items, domain_status = [], "failed"
    stages.append({"name": "domain_search", "status": domain_status})
    record("domain_search", domain_status, f"可核验候选 {len(domain_items)} 条")
    ranked = rank_candidates(site_items + domain_items)
    if ranked and ranked[0]["auto_match"]:
        stages.append({"name": "verification", "status": "matched"})
        return result("matched", "定向搜索找到可信原链接", vision_status,
                      clues=clues, url=ranked[0]["url"])
    stages.append({"name": "verification", "status": "candidates" if ranked else "no_results"})
    if ranked:
        return result("candidates", "找到相似内容，请确认原链接", vision_status,
                      candidates=ranked, clues=clues)
    reason = ("Bing 返回了搜索结果，但均不在目标网站，定向条件可能未生效；请打开预填的搜索页查看"
              if domain_status == "site_ignored" else "未找到可核验的原内容页")
    return result("not_found", reason, vision_status, clues=clues)

@router.get("/fetch-metadata")
async def fetch_metadata(url: str = Query(..., description="Target webpage URL")):
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url
    return scrape_url_metadata(url)
