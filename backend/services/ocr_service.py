import io
from typing import Dict, Any
from PIL import Image

try:
    from rapidocr_onnxruntime import RapidOCR
    ocr_engine = RapidOCR()
except Exception as e:
    print(f"Warning: RapidOCR initialization failed: {e}")
    ocr_engine = None

def extract_text_from_image(image_bytes: bytes) -> Dict[str, Any]:
    if not ocr_engine:
        return {"success": False, "title": "", "text": "", "count": 0, "error": "OCR engine not available"}

    try:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_byte_arr = io.BytesIO()
        pil_img.save(img_byte_arr, format='JPEG')
        processed_bytes = img_byte_arr.getvalue()

        result, _ = ocr_engine(processed_bytes)
        if not result:
            return {"success": True, "title": "", "text": "", "count": 0}

        entries = [item for item in result if len(item) > 1 and item[1]]
        lines = [item[1] for item in entries]
        layout = [{"text": item[1], "box": item[0]} for item in entries]
        full_text = "\n".join(lines)
        first_line = lines[0] if lines else ""

        return {
            "success": True,
            "title": first_line,
            "text": full_text,
            "count": len(lines),
            "lines": layout,
            "width": pil_img.width,
            "height": pil_img.height,
        }
    except Exception as e:
        print(f"OCR error: {e}")
        return {"success": False, "title": "", "text": "", "count": 0, "error": str(e)}
