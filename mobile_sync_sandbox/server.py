import os
import sys
import time
import json
import uuid
import socket
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INBOX_DIR = os.path.join(BASE_DIR, "inbox_data")
STATIC_DIR = os.path.join(BASE_DIR, "static")

os.makedirs(INBOX_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

app = FastAPI(title="Mobile Sync Sandbox Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_lan_ips() -> List[str]:
    ips: List[str] = []
    try:
        host_info = socket.gethostbyname_ex(socket.gethostname())
        for ip in host_info[2]:
            if ip != "127.0.0.1" and ":" not in ip:
                if ip not in ips:
                    ips.append(ip)
    except Exception:
        pass

    # Try connecting to external address to discover primary interface
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        primary = s.getsockname()[0]
        s.close()
        if primary in ips:
            ips.remove(primary)
        ips.insert(0, primary)
    except Exception:
        pass

    def ip_rank(addr: str) -> int:
        if addr.startswith("192.168."): return 0
        if addr.startswith("10."): return 1
        if addr.startswith("172."): return 2
        return 3

    return sorted(ips, key=ip_rank)

# Simple local state to track items metadata (consumed / dragged)
META_FILE = os.path.join(INBOX_DIR, ".meta.json")

def load_meta() -> Dict[str, Any]:
    if os.path.exists(META_FILE):
        try:
            with open(META_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_meta(data: Dict[str, Any]):
    try:
        with open(META_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving meta: {e}")

@app.get("/api/lan-info")
async def get_lan_info():
    ips = get_lan_ips()
    primary = ips[0] if ips else "127.0.0.1"
    port = 8088
    return {
        "primary_ip": primary,
        "all_ips": ips,
        "port": port,
        "mobile_url": f"http://{primary}:{port}/mobile",
        "inbox_path": INBOX_DIR,
    }

@app.post("/api/share")
async def receive_share(
    request: Request,
    file: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    text: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
):
    """
    Receives shares from mobile phone (either multipart/form-data or JSON).
    Handles images, texts, links, or screenshots.
    """
    # If sent as JSON
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            title = body.get("title", title)
            text = body.get("text", text)
            url = body.get("url", url)
        except Exception:
            pass

    item_id = f"item_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    time_prefix = time.strftime("%Y%m%d_%H%M%S")

    saved_items = []

    # 1. Image / File attached
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        if not ext:
            ext = ".png"
        saved_filename = f"{time_prefix}_{item_id}{ext}"
        target_path = os.path.join(INBOX_DIR, saved_filename)

        contents = await file.read()
        with open(target_path, "wb") as f:
            f.write(contents)

        meta = load_meta()
        meta[item_id] = {
            "id": item_id,
            "type": "image",
            "filename": saved_filename,
            "original_filename": file.filename,
            "url_path": f"/api/files/{saved_filename}",
            "title": title or file.filename,
            "text": text or "",
            "timestamp": timestamp,
            "size": len(contents),
            "consumed": False,
        }
        save_meta(meta)
        saved_items.append(meta[item_id])

    # 2. Text or URL share (without file or in addition to file)
    elif text or url or title:
        saved_filename = f"{time_prefix}_{item_id}.json"
        target_path = os.path.join(INBOX_DIR, saved_filename)

        item_type = "web" if (url or (text and text.strip().startswith(("http://", "https://")))) else "text"
        actual_url = url or (text.strip() if (text and text.strip().startswith(("http://", "https://"))) else "")

        payload = {
            "id": item_id,
            "type": item_type,
            "title": title or (actual_url if item_type == "web" else "手机随手记"),
            "text": text or "",
            "url": actual_url,
            "filename": saved_filename,
            "timestamp": timestamp,
            "consumed": False,
        }

        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        meta = load_meta()
        meta[item_id] = payload
        save_meta(meta)
        saved_items.append(payload)
    else:
        raise HTTPException(status_code=400, detail="Empty share: neither file nor text provided.")

    return {
        "success": True,
        "message": f"成功同步到电脑！已存入 inbox_data/",
        "items": saved_items,
    }

@app.get("/api/items")
async def list_items():
    """
    Returns all items in inbox_data/.
    Also scans for external files manually placed into inbox_data/.
    """
    meta = load_meta()
    existing_files = os.listdir(INBOX_DIR)

    # Automatically index files that might have been dropped directly into the folder
    for fname in existing_files:
        if fname.startswith(".") or fname == ".meta.json":
            continue
        # Check if already in meta
        already_tracked = any(item.get("filename") == fname for item in meta.values())
        if not already_tracked:
            ext = os.path.splitext(fname)[1].lower()
            fpath = os.path.join(INBOX_DIR, fname)
            fstat = os.stat(fpath)
            f_timestamp = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(fstat.st_mtime))
            auto_id = f"auto_{int(fstat.st_mtime * 1000)}_{uuid.uuid4().hex[:4]}"

            if ext in [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]:
                meta[auto_id] = {
                    "id": auto_id,
                    "type": "image",
                    "filename": fname,
                    "original_filename": fname,
                    "url_path": f"/api/files/{fname}",
                    "title": fname,
                    "text": "",
                    "timestamp": f_timestamp,
                    "size": fstat.st_size,
                    "consumed": False,
                }
            elif ext == ".json":
                try:
                    with open(fpath, "r", encoding="utf-8") as jf:
                        jdata = json.load(jf)
                        meta[auto_id] = {
                            "id": auto_id,
                            "type": jdata.get("type", "text"),
                            "filename": fname,
                            "title": jdata.get("title", fname),
                            "text": jdata.get("text", ""),
                            "url": jdata.get("url", ""),
                            "timestamp": jdata.get("timestamp", f_timestamp),
                            "consumed": jdata.get("consumed", False),
                        }
                except Exception:
                    pass
            elif ext in [".txt", ".md"]:
                try:
                    with open(fpath, "r", encoding="utf-8") as tf:
                        text_content = tf.read()
                        meta[auto_id] = {
                            "id": auto_id,
                            "type": "text",
                            "filename": fname,
                            "title": fname,
                            "text": text_content,
                            "timestamp": f_timestamp,
                            "consumed": False,
                        }
                except Exception:
                    pass

    save_meta(meta)

    # Return list sorted by timestamp descending
    items_list = list(meta.values())
    items_list.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return {"items": items_list, "count": len(items_list)}

@app.post("/api/items/{item_id}/consume")
async def mark_item_consumed(item_id: str):
    """
    Marks an item as consumed when dragged onto the canvas.
    """
    meta = load_meta()
    if item_id in meta:
        meta[item_id]["consumed"] = True
        save_meta(meta)
        return {"success": True, "item": meta[item_id]}
    return JSONResponse(status_code=404, content={"success": False, "detail": "Item not found"})

@app.delete("/api/items/{item_id}")
async def delete_item(item_id: str):
    """
    Deletes an item from inbox_data/ and metadata.
    """
    meta = load_meta()
    if item_id in meta:
        item = meta.pop(item_id)
        save_meta(meta)
        fname = item.get("filename")
        if fname:
            fpath = os.path.join(INBOX_DIR, fname)
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except Exception as e:
                    print(f"Error removing file: {e}")
        return {"success": True, "deleted_id": item_id}
    return JSONResponse(status_code=404, content={"success": False, "detail": "Item not found"})

# Mount inbox_data for previewing images
app.mount("/api/files", StaticFiles(directory=INBOX_DIR), name="inbox_files")

@app.get("/mobile")
async def get_mobile_page():
    return FileResponse(os.path.join(STATIC_DIR, "mobile.html"))

@app.get("/")
async def get_index_page():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

# Mount remaining static assets
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

if __name__ == "__main__":
    import uvicorn
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    ips = get_lan_ips()
    primary = ips[0] if ips else "127.0.0.1"
    print("\n=======================================================")
    print("[Mobile Sync Sandbox] Server starting...")
    print(f"Desktop Test Canvas: http://localhost:8088/")
    print(f"Mobile Companion Web: http://{primary}:8088/mobile")
    print(f"Local Storage Folder: {INBOX_DIR}")
    print("=======================================================\n")
    uvicorn.run(app, host="0.0.0.0", port=8088, log_level="info")
